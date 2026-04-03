import { useEffect, useRef, useState, useCallback } from 'react';
import { useVpn } from '../../context/VpnContext';
import { API_BASE_URL } from '../../config';
import { topologyDb } from '../db/db';
import type { Tower, Device, Link } from '../db/tables';
import type { SavedDevice } from '../../types/devices';

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
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
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
        const res = await fetch(`${API_BASE_URL}/db/devices`);
        if (res.ok) allAps = await res.json();
      } catch { /* offline — use empty */ }

      const aps = allAps.filter(d => d.role === 'ap');

      // ── 1. Sync Towers from VPN nodes ──
      const existingTowers = await topologyDb.towers.toArray();
      const vpnTowerIds = new Set<string>();

      for (let i = 0; i < vpnNodes.length; i++) {
        const node = vpnNodes[i];
        const towerId = `tower-${node.id}`;
        vpnTowerIds.add(towerId);

        const existing = existingTowers.find(t => t.id === towerId);
        if (existing) {
          await topologyDb.towers.update(towerId, {
            name: node.nombre_nodo,
            vpnRunning: node.running,
            vpnProtocol: node.service,
            updatedAt: now,
          });
        } else {
          const tower: Tower = {
            id: towerId,
            name: node.nombre_nodo,
            sourceNodeId: node.id,
            sourceType: 'vpn_node',
            vpnProtocol: node.service,
            vpnRunning: node.running,
            canvasX: 80 + i * 650,
            canvasY: 80,
            canvasWidth: 550,
            canvasHeight: 450,
            collapsed: false,
            createdAt: now,
            updatedAt: now,
          };
          await topologyDb.towers.add(tower);
        }
      }

      // Remove stale VPN towers
      const staleTowers = existingTowers.filter(
        t => t.sourceType === 'vpn_node' && !vpnTowerIds.has(t.id)
      );
      if (staleTowers.length > 0) {
        await topologyDb.towers.bulkDelete(staleTowers.map(t => t.id));
      }

      // ── 2. Sync VPN Node devices ──
      const existingDevices = await topologyDb.devices.toArray();
      const vpnDevIds = new Set<string>();

      for (const node of vpnNodes) {
        const devId = `vpndev-${node.id}`;
        vpnDevIds.add(devId);
        const towerId = `tower-${node.id}`;

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
            canvasY: 80,
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

      // ── 3. Sync APs ──
      const apDevIds = new Set<string>();
      const nodeIdSet = new Set(vpnNodes.map(n => n.id));

      for (const ap of aps) {
        if (!nodeIdSet.has(ap.nodeId)) continue; // AP belongs to unknown node
        const devId = `ap-${ap.id}`;
        apDevIds.add(devId);
        const towerId = `tower-${ap.nodeId}`;

        // Calculate position inside tower
        const sameNodeAps = aps.filter(a => a.nodeId === ap.nodeId && nodeIdSet.has(a.nodeId));
        const apIdx = sameNodeAps.indexOf(ap);

        const existing = existingDevices.find(d => d.id === devId);
        if (existing) {
          await topologyDb.devices.update(devId, {
            name: ap.name,
            ipAddress: ap.ip,
            macAddress: ap.mac,
            model: ap.model || 'AP',
            status: ap.activo ? 'online' : 'unknown',
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
            canvasY: 80 + apIdx * 130,
            status: ap.activo ? 'online' : 'unknown',
            createdAt: now,
            updatedAt: now,
          };
          await topologyDb.devices.add(dev);
        }
      }

      // Remove stale AP devices
      const staleApDevs = existingDevices.filter(
        d => d.sourceType === 'ap' && !apDevIds.has(d.id)
      );
      if (staleApDevs.length > 0) {
        await topologyDb.devices.bulkDelete(staleApDevs.map(d => d.id));
      }

      // ── 4. Sync CPEs from cachedStats.stations ──
      const cpeDevIds = new Set<string>();
      const apCpeMap = new Map<string, string[]>(); // apDevId → cpeDevIds[]

      for (const ap of aps) {
        if (!nodeIdSet.has(ap.nodeId)) continue;
        const stations = ap.cachedStats?.stations;
        if (!stations?.length) continue;

        const apDevId = `ap-${ap.id}`;
        const cpeIds: string[] = [];

        // Find tower for position calculation
        const tower = existingTowers.find(t => t.id === `tower-${ap.nodeId}`)
          ?? { canvasX: 80, canvasY: 80, canvasWidth: 550 };

        for (let si = 0; si < stations.length; si++) {
          const st = stations[si];
          if (!st.mac) continue;
          const cpeId = `cpe-${st.mac.replace(/[^a-fA-F0-9]/g, '')}`;
          cpeDevIds.add(cpeId);
          cpeIds.push(cpeId);

          const existing = existingDevices.find(d => d.id === cpeId);
          if (existing) {
            await topologyDb.devices.update(cpeId, {
              name: st.hostname || st.mac,
              model: st.remoteModel || 'CPE',
              ipAddress: st.lastIp ?? undefined,
              signal: st.signal ?? undefined,
              ccq: st.ccq ?? undefined,
              txRate: st.txRate ?? undefined,
              rxRate: st.rxRate ?? undefined,
              status: st.signal != null ? 'online' : 'offline',
              updatedAt: now,
            });
          } else {
            const dev: Device = {
              id: cpeId,
              towerId: null,
              type: 'cpe',
              role: 'cpe',
              name: st.hostname || st.mac,
              model: st.remoteModel || 'CPE',
              brand: 'Ubiquiti',
              ipAddress: st.lastIp ?? undefined,
              macAddress: st.mac,
              sourceId: st.mac,
              sourceType: 'cpe',
              signal: st.signal ?? undefined,
              ccq: st.ccq ?? undefined,
              txRate: st.txRate ?? undefined,
              rxRate: st.rxRate ?? undefined,
              canvasX: tower.canvasX + (tower as Tower).canvasWidth + 200,
              canvasY: tower.canvasY + si * 100,
              status: st.signal != null ? 'online' : 'offline',
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

      // Remove stale CPE devices
      const staleCpeDevs = existingDevices.filter(
        d => d.sourceType === 'cpe' && !cpeDevIds.has(d.id)
      );
      if (staleCpeDevs.length > 0) {
        await topologyDb.devices.bulkDelete(staleCpeDevs.map(d => d.id));
      }

      // ── 5. Sync auto Links ──
      const existingLinks = await topologyDb.links.toArray();
      const autoLinkIds = new Set<string>();

      // VPN Node → AP links (wired)
      for (const node of vpnNodes) {
        const vpnDevId = `vpndev-${node.id}`;
        const nodeAps = aps.filter(a => a.nodeId === node.id);

        for (const ap of nodeAps) {
          const apDevId = `ap-${ap.id}`;
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

      // AP → CPE links (wireless)
      for (const [apDevId, cpeIds] of apCpeMap) {
        for (const cpeId of cpeIds) {
          const linkId = `link-ap-cpe-${apDevId}-${cpeId}`;
          autoLinkIds.add(linkId);

          // Determine status from CPE device
          const cpeStatus = cpeDevIds.has(cpeId) ? 'online' : 'offline';
          const cpeDev = await topologyDb.devices.get(cpeId);
          const linkStatus = cpeDev?.status === 'online' ? 'active' : 'no_link';

          const existing = existingLinks.find(l => l.id === linkId);
          if (existing) {
            await topologyDb.links.update(linkId, {
              status: linkStatus as 'active' | 'no_link',
              updatedAt: now,
            });
          } else {
            const apName = aps.find(a => `ap-${a.id}` === apDevId)?.name ?? 'AP';
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
            expanded: true,
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

  // Debounced sync trigger
  const triggerSync = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(doSync, 1500);
  }, [doSync]);

  // Sync when nodes change
  useEffect(() => {
    triggerSync();
  }, [nodes, triggerSync]);

  // Periodic re-sync every 30s
  useEffect(() => {
    intervalRef.current = setInterval(doSync, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [doSync]);

  return { syncing, lastSync };
}
