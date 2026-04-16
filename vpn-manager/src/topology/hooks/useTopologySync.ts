import { useEffect, useRef, useState, useCallback } from 'react';
import { useVpn } from '../../context/VpnContext';
import { API_BASE_URL } from '../../config';
import { apiFetch } from '../../utils/apiClient';
import { topologyDb } from '../db/db';
import { useTopoUiStore } from '../store/topoUiStore';
import type { Tower, Device, Link } from '../db/tables';
import type { SavedDevice } from '../../types/devices';
import type { Torre } from '../../types/api';

/**
 * Syncs live VPN nodes, APs, and CPEs into the topology Dexie DB.
 * - VPN nodes → Towers + VpnNode devices
 * - APs (from /db/devices) → AP devices inside towers
 * - CPEs (from cachedStats.stations) → CPE devices linked to APs
 * - Links auto-generated between VpnNode→AP (wired) and AP→CPE (wireless)
 */
export function useTopologySync(): { syncing: boolean; lastSync: number } {
  const { nodes } = useVpn();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(0);
  const syncingRef = useRef(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const doSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);

    try {
      const vpnNodes = nodesRef.current;
      const now = Date.now();

      // ── Fetch APs from backend ──
      let allAps: SavedDevice[] = [];
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/db/devices`);
        if (res.ok) {
          const data = await res.json();
          allAps = Array.isArray(data?.devices) ? data.devices : Array.isArray(data) ? data : [];
        }
      } catch { /* offline — use empty */ }

      const aps = allAps.filter(d => d.role === 'ap');

      // ── Fetch Torres from backend ──
      let backendTorres: Torre[] = [];
      try {
        const resTorres = await apiFetch(`${API_BASE_URL}/api/topology/torres`);
        if (resTorres.ok) {
          const data = await resTorres.json();
          backendTorres = data.torres ?? [];
        }
      } catch { /* offline */ }

      // ── 1. Sync Towers from Backend Torres ──
      const existingTowers = await topologyDb.towers.toArray();
      const vpnTowerIds = new Set<string>();

      for (let i = 0; i < backendTorres.length; i++) {
        const torre = backendTorres[i];
        const towerId = `tower-${torre.id}`; // local ID
        vpnTowerIds.add(towerId);

        // Find connected vpn node for status (torre.nodo_id is ppp_user)
        const node = vpnNodes.find(n => n.ppp_user === torre.nodo_id);

        // Dynamic tower sizing based on AP count
        // APs link via nodeName matching node.nombre_nodo (no direct FK from ap_groups to nodes)
        const towerAps = node ? aps.filter(ap => ap.nodeName === node.nombre_nodo) : [];
        const calcHeight = Math.max(450, 200 + (towerAps.length * 140));

        const existing = existingTowers.find(t => t.id === towerId);
        if (existing) {
          await topologyDb.towers.update(towerId, {
            name: torre.nombre,
            location: torre.ubicacion,
            vpnRunning: node ? node.running : undefined,
            vpnProtocol: node ? node.service : undefined,
            sourceNodeId: torre.nodo_id || undefined,
            updatedAt: now,
            tramos: torre.tramos,
            contacto: torre.contacto,
            pdf_path: torre.pdf_path,
            nodo_id: torre.nodo_id,
            ptp_emisor_ip: torre.ptp_emisor_ip,
            ptp_emisor_nombre: torre.ptp_emisor_nombre,
            ptp_emisor_modelo: torre.ptp_emisor_modelo,
            ptp_receptor_ip: torre.ptp_receptor_ip,
            ptp_receptor_nombre: torre.ptp_receptor_nombre,
            ptp_receptor_modelo: torre.ptp_receptor_modelo,
            canvasHeight: existing.canvasHeight < calcHeight ? calcHeight : existing.canvasHeight,
          });
        } else {
          const tower: Tower = {
            id: towerId,
            name: torre.nombre,
            location: torre.ubicacion,
            sourceNodeId: torre.nodo_id || undefined,
            sourceType: 'manual', // Loaded from DB, not auto-generated from VPN
            vpnProtocol: node ? node.service : undefined,
            vpnRunning: node ? node.running : undefined,
            canvasX: 80 + i * 650,
            canvasY: 80,
            canvasWidth: 550,
            canvasHeight: calcHeight,
            collapsed: false,
            createdAt: torre.created_at || now,
            updatedAt: now,
            
            tramos: torre.tramos,
            contacto: torre.contacto,
            pdf_path: torre.pdf_path,
            nodo_id: torre.nodo_id,
            ptp_emisor_ip: torre.ptp_emisor_ip,
            ptp_emisor_nombre: torre.ptp_emisor_nombre,
            ptp_emisor_modelo: torre.ptp_emisor_modelo,
            ptp_receptor_ip: torre.ptp_receptor_ip,
            ptp_receptor_nombre: torre.ptp_receptor_nombre,
            ptp_receptor_modelo: torre.ptp_receptor_modelo,
          };
          await topologyDb.towers.add(tower);
        }
      }

      // Remove stale DB towers
      const staleTowers = existingTowers.filter(
        t => t.sourceType === 'manual' && !vpnTowerIds.has(t.id)
      );
      if (staleTowers.length > 0) {
        await topologyDb.towers.bulkDelete(staleTowers.map(t => t.id));
      }

      // ── 2. Sync VPN Node devices (only for those assigned to a Tower) ──
      const existingDevices = await topologyDb.devices.toArray();
      const vpnDevIds = new Set<string>();

      for (const torre of backendTorres) {
        if (!torre.nodo_id) continue;
        const node = vpnNodes.find(n => n.ppp_user === torre.nodo_id);
        if (!node) continue;

        const devId = `vpndev-${node.id}-torre-${torre.id}`;
        vpnDevIds.add(devId);
        const towerId = `tower-${torre.id}`;

        const existing = existingDevices.find(d => d.id === devId);
        if (existing) {
          await topologyDb.devices.update(devId, {
            name: node.nombre_nodo,
            ipAddress: node.ip_tunnel,
            status: node.running ? 'online' : 'offline',
            vpnIp: node.ip_tunnel,
            vpnService: node.service,
            lanSegment: node.segmento_lan,
            model: node.service === 'wireguard' ? 'WireGuard' : 'SSTP',
            updatedAt: now,
          });
        } else {
          const dev: Device = {
            id: devId,
            towerId,
            type: 'vpn_node',
            role: 'vpn_node',
            name: node.nombre_nodo,
            model: node.service === 'wireguard' ? 'WireGuard' : 'SSTP',
            brand: 'MikroTik',
            ipAddress: node.ip_tunnel,
            sourceId: node.id,
            sourceType: 'vpn_node',
            vpnIp: node.ip_tunnel,
            vpnService: node.service,
            lanSegment: node.segmento_lan,
            canvasX: 60,
            canvasY: 150, // Moved down to make room for PTP above
            status: node.running ? 'online' : 'offline',
            createdAt: now,
            updatedAt: now,
          };
          await topologyDb.devices.add(dev);
        }
      }

      // Remove stale VPN devices
      const staleVpnDevs = existingDevices.filter(
        d => d.sourceType === 'vpn_node' && !vpnDevIds.has(d.id)
      );
      if (staleVpnDevs.length > 0) {
        await topologyDb.devices.bulkDelete(staleVpnDevs.map(d => d.id));
      }

      // ── 2b. Sync Virtual PTP Devices ──
      const ptpDevIds = new Set<string>();

      for (const torre of backendTorres) {
        if (!torre.ptp_emisor_ip && !torre.ptp_receptor_ip) continue;
        
        const towerId = `tower-${torre.id}`;

        // Sync Emisor
        if (torre.ptp_emisor_ip) {
          const emisorId = `ptp-emisor-${torre.id}`;
          ptpDevIds.add(emisorId);
          const existing = existingDevices.find(d => d.id === emisorId);
          if (existing) {
            await topologyDb.devices.update(emisorId, {
              name: torre.ptp_emisor_nombre || 'PTP Emisor',
              ipAddress: torre.ptp_emisor_ip,
              model: torre.ptp_emisor_modelo || 'PTP',
              towerId: null,
              updatedAt: now,
            });
          } else {
            // PTP Emisor is OUTSIDE the tower (comes from a remote site)
            const towerObj = existingTowers.find(t => t.id === towerId);
            await topologyDb.devices.add({
              id: emisorId,
              towerId: null,
              type: 'ptp',
              role: 'ptp_main',
              name: torre.ptp_emisor_nombre || 'PTP Emisor',
              model: torre.ptp_emisor_modelo || 'PTP',
              brand: 'Desconocido',
              ipAddress: torre.ptp_emisor_ip,
              sourceId: torre.id,
              sourceType: 'ptp_virtual',
              canvasX: (towerObj?.canvasX ?? 0) - 180,
              canvasY: (towerObj?.canvasY ?? 0) + 30,
              status: 'online',
              createdAt: now,
              updatedAt: now,
            });
          }
        }

        // Sync Receptor
        if (torre.ptp_receptor_ip) {
          const receptorId = `ptp-receptor-${torre.id}`;
          ptpDevIds.add(receptorId);
          const existing = existingDevices.find(d => d.id === receptorId);
          if (existing) {
            await topologyDb.devices.update(receptorId, {
              name: torre.ptp_receptor_nombre || 'PTP Receptor',
              ipAddress: torre.ptp_receptor_ip,
              model: torre.ptp_receptor_modelo || 'PTP',
              updatedAt: now,
            });
          } else {
            await topologyDb.devices.add({
              id: receptorId,
              towerId,
              type: 'ptp',
              role: 'ptp_station',
              name: torre.ptp_receptor_nombre || 'PTP Receptor',
              model: torre.ptp_receptor_modelo || 'PTP',
              brand: 'Desconocido',
              ipAddress: torre.ptp_receptor_ip,
              sourceId: torre.id,
              sourceType: 'ptp_virtual',
              canvasX: 280, // Next to Emisor
              canvasY: 30,
              status: 'online',
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }

      // Remove stale virtual PTPs
      const stalePtps = existingDevices.filter(d => d.sourceType === 'ptp_virtual' && !ptpDevIds.has(d.id));
      if (stalePtps.length > 0) {
        await topologyDb.devices.bulkDelete(stalePtps.map(d => d.id));
      }

      // ── 3. Sync APs ──
      const apDevIds = new Set<string>();
      
      for (const torre of backendTorres) {
        if (!torre.nodo_id) continue;
        const torreNode = vpnNodes.find(n => n.ppp_user === torre.nodo_id);
        const towerAps = torreNode ? aps.filter(ap => ap.nodeName === torreNode.nombre_nodo) : [];

        for (let apIdx = 0; apIdx < towerAps.length; apIdx++) {
          const ap = towerAps[apIdx];
          const devId = `ap-${ap.id}-torre-${torre.id}`;
          apDevIds.add(devId);
          const towerId = `tower-${torre.id}`;

          const existing = existingDevices.find(d => d.id === devId);
          if (existing) {
            await topologyDb.devices.update(devId, {
              name: ap.name,
              ipAddress: ap.ip,
              macAddress: ap.mac,
              model: ap.model || 'AP',
              status: ap.is_active ? 'online' : 'unknown',
              cpeCount: ap.lastCpeCount ?? 0,
              towerId,
              updatedAt: now,
            });
          } else {
            const dev: Device = {
              id: devId,
              towerId,
              type: 'ap',
              role: 'ap',
              name: ap.name,
              model: ap.model || 'AP',
              brand: 'Ubiquiti',
              ipAddress: ap.ip,
              macAddress: ap.mac,
              sourceId: ap.id,
              sourceType: 'ap',
              cpeCount: ap.lastCpeCount ?? 0,
              canvasX: 300,
              canvasY: 150 + apIdx * 130, // Aligned with vpn node vertically
              status: ap.is_active ? 'online' : 'unknown',
              createdAt: now,
              updatedAt: now,
            };
            await topologyDb.devices.add(dev);
          }
        }
      }

      // Remove stale AP devices
      const staleApDevs = existingDevices.filter(
        d => d.sourceType === 'ap' && !apDevIds.has(d.id)
      );
      if (staleApDevs.length > 0) {
        await topologyDb.devices.bulkDelete(staleApDevs.map(d => d.id));
      }

      // ── 4. Sync CPEs from /api/ap/topology-cpes (SQLite cpes table) ──
      const cpeDevIds = new Set<string>();
      const apCpeMap = new Map<string, string[]>(); // apDevId → cpeDevIds[]

      // Fetch all known CPEs from the backend (cpes table)
      // Uses the same endpoint as AP Monitor: /api/ap-monitor/cpes
      interface KnownCpe {
        mac: string;
        hostname: string;
        modelo: string;
        ip_lan: string;
        ap_id: string | null;
        last_stats: string | null;
        remote_hostname: string;
        remote_platform: string;
        last_seen: number;
      }
      let allKnownCpes: KnownCpe[] = [];
      try {
        const resCpe = await apiFetch(`${API_BASE_URL}/api/ap-monitor/cpes`);
        if (resCpe.ok) {
          const dataCpe = await resCpe.json();
          allKnownCpes = dataCpe.cpes ?? [];
        }
      } catch { /* offline */ }

      for (const torre of backendTorres) {
        if (!torre.nodo_id) continue;
        const torreNodeCpe = vpnNodes.find(n => n.ppp_user === torre.nodo_id);
        const towerApsCpe = torreNodeCpe ? aps.filter(ap => ap.nodeName === torreNodeCpe.nombre_nodo) : [];
        const towerId = `tower-${torre.id}`;

        for (const ap of towerApsCpe) {
          const apDevId = `ap-${ap.id}-torre-${torre.id}`;
          // Find CPEs linked to this AP in the backend data (ap_id matches ap.id from aps table)
          const apCpes = allKnownCpes.filter((c: KnownCpe) => c.ap_id === ap.id);
          if (apCpes.length === 0) {
            // Limpiar CPEs huérfanos de este AP si los hubiera
            const orphanCpes = existingDevices.filter(d => d.sourceType === 'cpe' && d.sourceId === apDevId);
            if (orphanCpes.length > 0) {
              await topologyDb.devices.bulkDelete(orphanCpes.map(d => d.id));
            }
            continue;
          }

          const cpeIds: string[] = [];

          // Find tower for position calculation
          const tower = existingTowers.find(t => t.id === towerId)
            ?? { canvasX: 80, canvasY: 80, canvasWidth: 550 };

          for (let si = 0; si < apCpes.length; si++) {
            const cpe = apCpes[si];
            if (!cpe.mac) continue;
            const cpeId = `cpe-${ap.id}-${cpe.mac.replace(/:/g, '')}`;
            cpeDevIds.add(cpeId);
            cpeIds.push(cpeId);

            // Parse last_stats for signal data (same JSON the AP Monitor stores per poll)
            let signal: number | undefined;
            let ccq: number | undefined;
            let txRate: number | undefined;
            let rxRate: number | undefined;
            if (cpe.last_stats) {
              try {
                const stats = JSON.parse(cpe.last_stats);
                signal = stats.signal ?? undefined;
                ccq = stats.ccq ?? undefined;
                txRate = stats.tx_rate ?? undefined;
                rxRate = stats.rx_rate ?? undefined;
              } catch { /* ignore */ }
            }

            const cpeName = cpe.hostname || cpe.remote_hostname || cpe.mac;
            const existing = existingDevices.find(d => d.id === cpeId);
            if (existing) {
              await topologyDb.devices.update(cpeId, {
                name: cpeName,
                model: cpe.modelo || 'CPE',
                ipAddress: cpe.ip_lan || undefined,
                signal,
                ccq,
                txRate,
                rxRate,
                sourceId: apDevId,
                towerId: null,
                status: signal != null ? 'online' : 'offline',
                updatedAt: now,
              });
            } else {
              const dev: Device = {
                id: cpeId,
                towerId: null,
                type: 'cpe',
                role: 'cpe',
                name: cpeName,
                model: cpe.modelo || 'CPE',
                brand: 'Ubiquiti',
                ipAddress: cpe.ip_lan || undefined,
                macAddress: cpe.mac,
                sourceId: apDevId,
                sourceType: 'cpe',
                signal,
                ccq,
                txRate,
                rxRate,
                canvasX: (tower as Tower).canvasX + (tower as Tower).canvasWidth + 80,
                canvasY: (tower as Tower).canvasY + 150 + si * 100,
                status: signal != null ? 'online' : 'offline',
                createdAt: now,
                updatedAt: now,
              };
              await topologyDb.devices.add(dev);
            }
          }

          if (cpeIds.length > 0) {
            apCpeMap.set(apDevId, cpeIds);
          }
        }
      }

      // Remove stale CPE devices
      const staleCpeDevs = existingDevices.filter(
        d => d.sourceType === 'cpe' && !cpeDevIds.has(d.id)
      );
      if (staleCpeDevs.length > 0) {
        await topologyDb.devices.bulkDelete(staleCpeDevs.map(d => d.id));
      }
      // Update AP cpeCount from real CPE data
      for (const [apDevId, cpeIds] of apCpeMap) {
        await topologyDb.devices.update(apDevId, { cpeCount: cpeIds.length });
      }

      // ── 5. Sync auto Links ──
      const existingLinks = await topologyDb.links.toArray();
      const autoLinkIds = new Set<string>();

      // VPN Node → AP links (wired) - Only for Torre nodes
      for (const torre of backendTorres) {
        if (!torre.nodo_id) continue;
        const node = vpnNodes.find(n => n.ppp_user === torre.nodo_id);
        if (!node) continue;

        const vpnDevId = `vpndev-${node.id}-torre-${torre.id}`;
        const towerAps = aps.filter(a => a.nodeName === node.nombre_nodo);

        for (const ap of towerAps) {
          const apDevId = `ap-${ap.id}-torre-${torre.id}`;
          const linkId = `link-vpn-ap-${vpnDevId}-${apDevId}`;
          autoLinkIds.add(linkId);

          const existing = existingLinks.find(l => l.id === linkId);
          if (!existing) {
            const link: Link = {
              id: linkId,
              name: `${node.nombre_nodo} → ${ap.name}`,
              sourceId: vpnDevId,
              targetId: apDevId,
              linkType: 'wired',
              status: 'active',
              sourceType: 'auto',
              createdAt: now,
              updatedAt: now,
            };
            await topologyDb.links.add(link);
          }
        }
      }

      // PTP Receptor → PTP Emisor links (wireless_ptp) — Receptor inside tower (left), Emisor outside (right)
      for (const torre of backendTorres) {
        if (!torre.ptp_emisor_ip || !torre.ptp_receptor_ip) continue;
        const linkId = `link-ptp-${torre.id}`;
        const emisorId = `ptp-emisor-${torre.id}`;
        const receptorId = `ptp-receptor-${torre.id}`;
        autoLinkIds.add(linkId);

        const existing = existingLinks.find(l => l.id === linkId);
        if (!existing) {
          const link: Link = {
            id: linkId,
            name: `${torre.ptp_receptor_nombre || 'Receptor'} ↔ ${torre.ptp_emisor_nombre || 'Emisor'} PTP`,
            sourceId: receptorId,
            targetId: emisorId,
            linkType: 'wireless_ptp',
            status: 'active',
            sourceType: 'auto',
            createdAt: now,
            updatedAt: now,
          };
          await topologyDb.links.add(link);
        } else if (existing.sourceId !== receptorId || existing.targetId !== emisorId) {
          // Fix old crossed direction
          await topologyDb.links.update(linkId, {
            sourceId: receptorId,
            targetId: emisorId,
            updatedAt: now,
          });
        }
      }

      // VPN Node → PTP Receptor links (wired) — VPN source (right) → Receptor target (left)
      for (const torre of backendTorres) {
        if (!torre.ptp_receptor_ip || !torre.nodo_id) continue;
        const node = vpnNodes.find(n => n.ppp_user === torre.nodo_id);
        if (!node) continue;

        const linkId = `link-ptp-vpn-${torre.id}`;
        const receptorId = `ptp-receptor-${torre.id}`;
        const vpnDevId = `vpndev-${node.id}-torre-${torre.id}`;
        autoLinkIds.add(linkId);

        const existing = existingLinks.find(l => l.id === linkId);
        if (!existing) {
          const link: Link = {
            id: linkId,
            name: `${node.nombre_nodo} → ${torre.ptp_receptor_nombre || 'Receptor'}`,
            sourceId: vpnDevId,
            targetId: receptorId,
            linkType: 'wired',
            status: 'active',
            sourceType: 'auto',
            createdAt: now,
            updatedAt: now,
          };
          await topologyDb.links.add(link);
        } else if (existing.sourceId !== vpnDevId || existing.targetId !== receptorId) {
          await topologyDb.links.update(linkId, {
            sourceId: vpnDevId,
            targetId: receptorId,
            updatedAt: now,
          });
        }
      }

      // AP → CPE links (wireless)
      for (const [apDevId, cpeIds] of apCpeMap) {
        for (const cpeId of cpeIds) {
          const linkId = `link-ap-cpe-${apDevId}-${cpeId}`;
          autoLinkIds.add(linkId);

          // Determine status from CPE device
          const cpeDev = await topologyDb.devices.get(cpeId);
          const linkStatus = cpeDev?.status === 'online' ? 'active' : 'no_link';

          const existing = existingLinks.find(l => l.id === linkId);
          if (existing) {
            await topologyDb.links.update(linkId, {
              status: linkStatus as 'active' | 'no_link',
              updatedAt: now,
            });
          } else {
            const apName = aps.find(a => `ap-${a.id}-torre-${a.nodeId}` === apDevId)?.name ?? 'AP';
            const link: Link = {
              id: linkId,
              name: `${apName} → ${cpeDev?.name ?? cpeId}`,
              sourceId: apDevId,
              targetId: cpeId,
              linkType: 'wireless_ptmp',
              status: linkStatus as 'active' | 'no_link',
              sourceType: 'auto',
              createdAt: now,
              updatedAt: now,
            };
            await topologyDb.links.add(link);
          }
        }
      }

      // Remove stale auto links
      const staleLinks = existingLinks.filter(
        l => l.sourceType === 'auto' && !autoLinkIds.has(l.id)
      );
      if (staleLinks.length > 0) {
        await topologyDb.links.bulkDelete(staleLinks.map(l => l.id));
      }

      // ── 6. Sync ApCpeGroups ──
      const existingGroups = await topologyDb.apCpeGroups.toArray();

      for (const [apDevId, cpeIds] of apCpeMap) {
        const groupId = `group-${apDevId}`;
        const existing = existingGroups.find(g => g.id === groupId);
        if (existing) {
          await topologyDb.apCpeGroups.update(groupId, {
            cpeDeviceIds: cpeIds,
            updatedAt: now,
          });
        } else {
          await topologyDb.apCpeGroups.add({
            id: groupId,
            apDeviceId: apDevId,
            cpeDeviceIds: cpeIds,
            expanded: false,
            updatedAt: now,
          });
        }
      }

      // Remove groups for APs that no longer have CPEs
      const activeGroupApIds = new Set(apCpeMap.keys());
      const staleGroups = existingGroups.filter(
        g => !activeGroupApIds.has(g.apDeviceId)
      );
      if (staleGroups.length > 0) {
        await topologyDb.apCpeGroups.bulkDelete(staleGroups.map(g => g.id));
      }

      setLastSync(now);
    } catch (err) {
      console.error('[useTopologySync] sync error:', err);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  const { autoSync } = useTopoUiStore();
  const initialSyncDone = useRef(false);

  // Debounced sync trigger
  const triggerSync = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(doSync, 1500);
  }, [doSync]);

  // Initial sync always runs once; subsequent syncs respect autoSync
  useEffect(() => {
    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      triggerSync();
    } else if (autoSync) {
      triggerSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, triggerSync]);

  // Periodic re-sync every 30s (only when autoSync is enabled)
  useEffect(() => {
    if (!autoSync) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = setInterval(doSync, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [doSync, autoSync]);

  return { syncing, lastSync };
}
