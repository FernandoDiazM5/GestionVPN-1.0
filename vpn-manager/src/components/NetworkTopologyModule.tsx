import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../utils/apiClient';
import {
  Radio, Wifi, RefreshCw, Activity,
  Circle, Layers, ArrowLeft, Server,
  ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { useVpn } from '../context/VpnContext';
import { deviceDb } from '../store/deviceDb';
import { cpeCache } from '../store/cpeCache';
import { API_BASE_URL } from '../config';
import { TowerContainer } from '../topology/components/list/TowerContainer';
import { CollapsibleNode } from '../topology/components/list/CollapsibleNode';
import type { SavedDevice } from '../types/devices';
import type { NodeInfo } from '../types/api';

/* ─── helpers ────────────────────────────────────────────────────────────── */
const sigColor = (sig?: number | null) =>
  sig == null    ? '#64748b' :
  sig >= -65     ? '#34d399' :
  sig >= -75     ? '#fbbf24' :
  sig >= -85     ? '#fb923c' : '#f87171';

/** Formatea segundos a "Xd HH:MM:SS" */
function fmtUptime(sec: number): string {
  const d  = Math.floor(sec / 86400);
  const hh = Math.floor((sec % 86400) / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const p  = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${p(hh)}:${p(mm)}:${p(ss)}` : `${p(hh)}:${p(mm)}:${p(ss)}`;
}

/**
 * Extrae CPEs desde cachedStats.stations de cada AP y los guarda en
 * IndexedDB del browser (cpeCache). Hace upsert por MAC: si ya existe
 * preserva campos manuales y solo actualiza métricas RF.
 * NO toca la base de datos SQLite del servidor.
 */
async function extractAndPersistCpes(
  aps: SavedDevice[],
  existing: SavedDevice[],
): Promise<SavedDevice[]> {
  const byId = new Map(existing.map(d => [d.id, d]));
  const results: SavedDevice[] = [];

  for (const ap of aps) {
    const stations = ap.cachedStats?.stations;
    if (!stations || stations.length === 0) continue;

    const apName  = ap.cachedStats?.deviceName || ap.name || ap.ip;
    const apWlan  = ap.cachedStats?.wlanMac    || ap.mac  || '';
    const apEssid = ap.cachedStats?.essid      || ap.essid || '';

    for (const sta of stations) {
      if (!sta.mac) continue;
      const id = sta.mac.replace(/:/g, '').toUpperCase();

      const freshStats = {
        signal:         sta.signal         ?? null,
        noiseFloor:     sta.noiseFloor     ?? null,
        ccq:            sta.ccq            ?? null,
        txRate:         sta.txRate         ?? null,
        rxRate:         sta.rxRate         ?? null,
        txPower:        sta.txPower        ?? null,
        airmaxQuality:  sta.airmaxQuality  ?? null,
        airmaxCapacity: sta.airmaxCapacity ?? null,
        txLatency:      sta.txLatency      ?? null,
        deviceName:     sta.hostname       ?? null,
        deviceModel:    sta.remoteModel    ?? null,
        // Guarda MAC del AP para que matchStaToAp funcione por MAC
        apMac:          apWlan             || null,
        ...(sta.uptime != null ? { uptimeStr: fmtUptime(sta.uptime) } : {}),
        ...(sta.distance != null ? { distance: sta.distance } : {}),
      };

      const prev = byId.get(id);
      const cpe: SavedDevice = prev
        ? {
            ...prev,
            // Actualiza IP si ahora la conocemos
            ip:          sta.lastIp || prev.ip || '',
            name:        sta.hostname || prev.name || sta.mac,
            model:       sta.remoteModel || prev.model || 'Ubiquiti CPE',
            parentAp:    apName,
            essid:       apEssid || prev.essid || '',
            lastSeen:    Date.now(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cachedStats: { ...(prev.cachedStats ?? {}), ...freshStats } as any,
          }
        : {
            id,
            mac:         sta.mac.toUpperCase(),
            ip:          sta.lastIp || '',
            name:        sta.hostname || sta.mac,
            model:       sta.remoteModel || 'Ubiquiti CPE',
            firmware:    '',
            role:        'sta',
            parentAp:    apName,
            essid:       apEssid,
            frequency:   ap.frequency || 0,
            nodeId:      ap.nodeId,
            nodeName:    ap.nodeName,
            addedAt:     Date.now(),
            lastSeen:    Date.now(),
            cachedStats: freshStats,
          };

      results.push(cpe);
      byId.set(id, cpe); // evita duplicados si dos APs reportan la misma MAC
    }
  }

  // Guarda en IndexedDB del browser — no toca SQLite del servidor
  if (results.length > 0) await cpeCache.upsertMany(results);
  return results;
}

/**
 * Carga CPEs del endpoint /api/ap-monitor/topology-cpes, los convierte a
 * SavedDevice y los guarda en IndexedDB. Los CPEs se enlazan al AP padre
 * via ap_nodeId (VPN node) y ap_ip (para matchStaToAp por hostname).
 * NO escribe en SQLite del servidor.
 */
async function loadAndCacheCpesFromServer(
  devices: SavedDevice[],
): Promise<SavedDevice[]> {
  try {
    const res  = await apiFetch(`${API_BASE_URL}/api/ap-monitor/topology-cpes`);
    const data = await res.json() as {
      success: boolean;
      cpes: Array<{
        mac: string;
        hostname: string;
        modelo: string;
        firmware: string;
        ip_lan: string;
        mac_wlan: string;
        ssid_ap: string;
        frecuencia_mhz: number | null;
        last_seen: number;
        ap_id: string;
        ap_ip: string | null;
        ap_hostname: string | null;
        ap_nodeId: string | null;
        remote_hostname: string | null;
        remote_platform: string | null;
        last_stats: string | null; // JSON string of full wstalist/sta.cgi record
        lastSignal: {
          signal_dbm: number | null;
          noisefloor_dbm: number | null;
          ccq_pct: number | null;
          downlink_mbps: number | null;
          uplink_mbps: number | null;
          distancia_km: number | null;
          timestamp: number;
        } | null;
      }>;
    };

    if (!data.success || !data.cpes?.length) return [];

    // Índice de devices por IP para obtener el nombre del AP padre
    const devByIp = new Map(devices.map(d => [d.ip, d]));
    // Índice de devices por ID para evitar duplicados
    const devById = new Map(devices.map(d => [d.id, d]));

    const result: SavedDevice[] = [];

    for (const c of data.cpes) {
      if (!c.mac || !c.ap_nodeId) continue;

      const id = c.mac.replace(/:/g, '').toUpperCase();

      // Si ya existe como device en SQLite con SSH creds, no sobreescribir
      const existingDev = devById.get(id);
      if (existingDev?.sshUser) continue;

      // Nombre del AP padre desde devices (tiene hostname completo)
      const apDevice = c.ap_ip ? devByIp.get(c.ap_ip) : null;
      const apName   = apDevice
        ? (apDevice.cachedStats?.deviceName || apDevice.name)
        : (c.ap_hostname || c.ap_ip || '');

      const nodeName = devices.find(d => d.nodeId === c.ap_nodeId)?.nodeName || c.ap_nodeId || '';

      const sig = c.lastSignal;
      // Parse full wstalist/sta.cgi record if available
      let ls: Record<string, unknown> = {};
      if (c.last_stats) {
        try { ls = JSON.parse(c.last_stats) as Record<string, unknown>; } catch { /* ignore */ }
      }
      const cachedStats = {
        // Señal AP side
        signal:            (ls.signal         as number ?? null) ?? sig?.signal_dbm    ?? null,
        noiseFloor:        (ls.noisefloor      as number ?? null) ?? sig?.noisefloor_dbm ?? null,
        ccq:               (ls.ccq             as number ?? null) ?? sig?.ccq_pct        ?? null,
        // Tasas TX/RX
        txRate:            (ls.tx_rate         as number ?? null) ?? sig?.uplink_mbps    ?? null,
        rxRate:            (ls.rx_rate         as number ?? null) ?? sig?.downlink_mbps  ?? null,
        // Señal remota (CPE side)
        remoteSig:         ls.remote_signal    as number ?? null,
        remoteNoiseFloor:  ls.remote_noisefloor as number ?? null,
        remoteTxPower:     ls.remote_tx_power  as number ?? null,
        remoteCpuLoad:     ls.remote_cpuload   as number ?? null,
        // RF
        txPower:           ls.tx_power         as number ?? null,
        distance:          (ls.distance        as number ?? null) ?? sig?.distancia_km   ?? null,
        txLatency:         ls.tx_latency       as number ?? null,
        rssi:              ls.rssi             as number ?? null,
        // AirMax M5
        airmaxQuality:     ls.airmax_quality   as number ?? null,
        airmaxCapacity:    ls.airmax_capacity  as number ?? null,
        airmaxSignal:      ls.airmax_signal    as number ?? null,
        // AirMax AC
        airmaxDcap:        ls.airmax_dcap      as number ?? null,
        airmaxUcap:        ls.airmax_ucap      as number ?? null,
        airmaxCinrRx:      ls.airmax_cinr_rx   as number ?? null,
        airmaxCinrTx:      ls.airmax_cinr_tx   as number ?? null,
        // Bytes
        txBytes:           ls.tx_bytes         as number ?? null,
        rxBytes:           ls.rx_bytes         as number ?? null,
        throughputRxKbps:  ls.throughputRxKbps as number ?? null,
        throughputTxKbps:  ls.throughputTxKbps as number ?? null,
        // Firmware family
        firmwareFamily:    ls.firmware_family  as string ?? null,
        // Uptime
        uptimeStr:         ls.uptimeStr        as string ?? null,
        uptime:            ls.uptime           as number ?? null,
        // Identificación
        deviceName:        ((ls.cpe_name as string || null) ?? c.hostname) || null,
        deviceModel:       ((ls.cpe_product as string || null) ?? c.modelo) || null,
        remoteHostname:    ((ls.remote_hostname as string || null) ?? c.remote_hostname) || null,
        remoteModel:       ((ls.remote_platform as string || null) ?? c.remote_platform) || null,
        remoteVersion:     (ls.remote_version as string) ?? null,
        remoteNetrole:     (ls.remote_netrole as string) ?? null,
        remoteDistance:    ls.remote_distance   as number ?? null,
        remoteTxLatency:   ls.remote_tx_latency as number ?? null,
        firmwareVersion:   c.firmware || null,
        essid:             c.ssid_ap  || null,
        apMac:             c.mac_wlan || null,
        lastIp:            ((ls.lastip as string || null) ?? c.ip_lan) || null,
      };

      const cpe: SavedDevice = existingDev
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? { ...existingDev, parentAp: apName, lastSeen: c.last_seen, cachedStats: { ...(existingDev.cachedStats ?? {}), ...cachedStats } as any }
        : {
            id,
            mac:        c.mac.toUpperCase(),
            ip:         c.ip_lan || '',
            name:       c.hostname || c.mac,
            model:      c.modelo   || 'Ubiquiti CPE',
            firmware:   c.firmware || '',
            role:       'sta',
            parentAp:   apName,
            essid:      c.ssid_ap  || '',
            frequency:  c.frecuencia_mhz || 0,
            nodeId:     c.ap_nodeId || '',
            nodeName,
            addedAt:    c.last_seen,
            lastSeen:   c.last_seen,
            cachedStats,
          };

      result.push(cpe);
    }

    // Guarda en IndexedDB del browser
    if (result.length > 0) await cpeCache.upsertMany(result);
    return result;
  } catch {
    // Si el servidor no responde, devuelve vacío (los datos vienen de IndexedDB)
    return [];
  }
}

/** Match a STA to its parent AP using multiple heuristics */
function matchStaToAp(sta: SavedDevice, ap: SavedDevice): boolean {
  // 1. WLAN MAC match — most reliable when SSH has been run
  const apWlan = (ap.cachedStats?.wlanMac || ap.mac || '').toUpperCase();
  const staBssid = (sta.cachedStats?.apMac || sta.apMac || '').toUpperCase();
  if (apWlan && staBssid && apWlan === staBssid) return true;

  // 2. Hostname/name match (parentAp = remote hostname reported by airOS)
  const apHost = (ap.cachedStats?.deviceName || ap.name || '').toLowerCase().trim();
  const staParent = (sta.parentAp || '').toLowerCase().trim();
  if (apHost && staParent && apHost === staParent) return true;

  // 3. ESSID match (sta.parentAp might contain the SSID when hostname unavailable)
  const apEssid = (ap.cachedStats?.essid || ap.essid || '').toLowerCase().trim();
  if (apEssid && staParent && apEssid === staParent) return true;

  return false;
}

/* ══════════════════════════════════════════════════════════════════════════
                         NIVEL 1 — Tarjeta de Nodo
   ══════════════════════════════════════════════════════════════════════════ */
function NodeCard({ node, deviceCount, onClick }: {
  node: NodeInfo;
  deviceCount: number;
  onClick: () => void;
}) {
  const on = node.running;
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: on
          ? 'linear-gradient(135deg,#091a2a 0%,#0c2038 100%)'
          : 'linear-gradient(135deg,#0c0f1a 0%,#111420 100%)',
        border: `1.5px solid ${on
          ? hovered ? 'rgba(34,211,238,0.7)' : 'rgba(34,211,238,0.45)'
          : hovered ? 'rgba(99,102,241,0.4)' : 'rgba(71,85,105,0.4)'}`,
        borderRadius: 18,
        padding: '18px 18px 14px',
        minWidth: 200,
        width: 210,
        cursor: 'pointer',
        transition: 'all .22s',
        position: 'relative',
        fontFamily: "'Exo 2',sans-serif",
        boxShadow: on
          ? hovered
            ? '0 0 30px rgba(34,211,238,0.22), 0 8px 24px rgba(0,0,0,0.55)'
            : '0 0 20px rgba(34,211,238,0.1), 0 4px 16px rgba(0,0,0,0.4)'
          : hovered
            ? '0 8px 24px rgba(0,0,0,0.5)'
            : '0 4px 16px rgba(0,0,0,0.35)',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}
    >
      {/* LED */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        width: 8, height: 8, borderRadius: '50%',
        background: on ? '#34d399' : '#475569',
        boxShadow: on ? '0 0 8px #34d399' : 'none',
        animation: on ? 'topo-blink 2s ease-in-out infinite' : 'none',
      }} />

      {/* Icon + nombre */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: on ? 'rgba(34,211,238,0.12)' : 'rgba(71,85,105,0.15)',
          border: `1px solid ${on ? 'rgba(34,211,238,0.3)' : 'rgba(71,85,105,0.3)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Activity size={17} color={on ? '#22d3ee' : '#475569'} />
        </div>
        <div style={{ minWidth: 0, flex: 1, paddingRight: 18 }}>
          <div style={{
            fontSize: 13, fontWeight: 800, color: '#e2e8f0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {node.nombre_nodo}
          </div>
          <div style={{
            fontSize: 9.5, color: '#22d3ee', fontFamily: 'JetBrains Mono,monospace', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {node.ip_tunnel}
          </div>
        </div>
      </div>

      {/* Info lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {node.nombre_vrf ? (
          <InfoLine label="VRF" value={node.nombre_vrf} />
        ) : null}
        {node.segmento_lan ? (
          <InfoLine label="LAN" value={node.segmento_lan} />
        ) : null}
        {on && node.uptime ? (
          <InfoLine label="Up" value={node.uptime} />
        ) : null}
      </div>

      {/* Footer */}
      <div style={{
        paddingTop: 8, borderTop: '1px solid rgba(71,85,105,0.3)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{
          fontSize: 10, color: on ? '#67e8f9' : '#475569',
          fontFamily: 'JetBrains Mono,monospace',
        }}>
          {deviceCount} equipo{deviceCount !== 1 ? 's' : ''}
        </span>
        <span style={{
          fontSize: 9, color: hovered ? '#22d3ee' : '#334155',
          letterSpacing: 0.5, fontWeight: 700, transition: 'color .2s',
        }}>
          VER →
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
                         NIVEL 2 — Tarjeta AP
   ══════════════════════════════════════════════════════════════════════════ */
function ApCard({ device, cpeCount }: { device: SavedDevice; cpeCount: number }) {
  const sig   = device.cachedStats?.signal;
  const model = device.cachedStats?.deviceModel || device.model;
  const sc    = sigColor(sig);
  const essid = device.cachedStats?.essid || device.essid;
  const name  = device.name || model || device.ip;

  return (
    <div style={{
      background: 'linear-gradient(135deg,#0e1530 0%,#121b38 100%)',
      border: '1.5px solid rgba(99,102,241,0.5)',
      borderRadius: 14,
      padding: '12px 14px',
      width: 210,
      fontFamily: "'Exo 2',sans-serif",
      boxShadow: '0 0 22px rgba(99,102,241,0.15), 0 4px 16px rgba(0,0,0,0.45)',
      flexShrink: 0,
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0, marginTop: 1,
          background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Radio size={14} color="#818cf8" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Nombre completo — permite 2 líneas */}
          <div style={{
            fontSize: 11, fontWeight: 800, color: '#e2e8f0',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
            wordBreak: 'break-word',
          }} title={name}>
            {name}
          </div>
          <div style={{ fontSize: 8.5, color: '#64748b', fontFamily: 'JetBrains Mono,monospace', marginTop: 2 }}>
            {device.ip}
          </div>
        </div>
      </div>

      {model && model !== device.name && (
        <div style={{
          fontSize: 9, color: '#818cf8', marginBottom: 7,
          whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3,
        }}>
          {model}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {essid && <InfoLine label="SSID" value={essid} />}
        {sig != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: .8 }}>Signal</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: sc, fontFamily: 'JetBrains Mono,monospace' }}>
              {sig} dBm
            </span>
          </div>
        )}
        {device.cachedStats?.txRate != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: .8 }}>TX</span>
            <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'JetBrains Mono,monospace' }}>
              {device.cachedStats.txRate} Mbps
            </span>
          </div>
        )}
      </div>

      <div style={{
        marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(71,85,105,0.25)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{
          fontSize: 8, fontWeight: 800, letterSpacing: 1.2,
          textTransform: 'uppercase', color: '#818cf8',
        }}>ACCESS POINT</span>
        <span style={{ fontSize: 9, color: '#67e8f9', fontFamily: 'JetBrains Mono,monospace' }}>
          {cpeCount} CPE{cpeCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

/* ── CPE Card — colapsable ── */
function CpeCard({ device }: { device: SavedDevice }) {
  const [expanded, setExpanded] = useState(false);

  const cs        = device.cachedStats;
  const sig       = cs?.signal;
  const remoteSig = cs?.remoteSig;
  const model     = cs?.deviceModel || device.model;
  const _sc        = sigColor(sig); void _sc;
  const _rsc       = sigColor(remoteSig); void _rsc;
  const ff        = cs?.firmwareFamily;

  const hasAirMaxM5 = cs?.airmaxQuality != null || cs?.airmaxCapacity != null;
  const hasAirMaxAC = cs?.airmaxDcap    != null || cs?.airmaxCinrRx   != null;

  const displayName  = cs?.remoteHostname || cs?.deviceName || device.name || model || device.ip;
  const displayModel = cs?.remoteModel || model;

  return (
    <div style={{
      background: 'linear-gradient(135deg,#140e30 0%,#1a1238 100%)',
      border: `1px solid ${expanded ? 'rgba(167,139,250,0.6)' : 'rgba(167,139,250,0.28)'}`,
      borderRadius: 12,
      width: 210,
      fontFamily: "'Exo 2',sans-serif",
      boxShadow: expanded
        ? '0 0 18px rgba(167,139,250,0.18), 0 4px 16px rgba(0,0,0,0.5)'
        : '0 2px 10px rgba(0,0,0,0.35)',
      flexShrink: 0,
      transition: 'border-color .2s, box-shadow .2s',
      overflow: 'hidden',
    }}>

      {/* ── Cabecera siempre visible — click para desplegar ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '9px 11px 8px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* fila: icono + nombre + badge + chevron */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0, marginTop: 1,
            background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Wifi size={12} color="#a78bfa" />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Nombre completo — hasta 2 líneas */}
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#cbd5e1',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
              wordBreak: 'break-word',
            }} title={String(displayName)}>
              {displayName}
            </div>
            <div style={{ fontSize: 7.5, color: '#64748b', fontFamily: 'JetBrains Mono,monospace', marginTop: 1 }}>
              {cs?.lastIp || device.ip || device.mac}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            {ff && (
              <div style={{
                fontSize: 7, fontWeight: 800, letterSpacing: .8, padding: '2px 5px',
                borderRadius: 4,
                background: ff === 'AC' ? 'rgba(34,211,238,0.12)' : 'rgba(251,191,36,0.12)',
                border: `1px solid ${ff === 'AC' ? 'rgba(34,211,238,0.3)' : 'rgba(251,191,36,0.3)'}`,
                color: ff === 'AC' ? '#67e8f9' : '#fbbf24',
              }}>{ff}</div>
            )}
            <div style={{ color: '#475569', lineHeight: 0, marginTop: 2 }}>
              {expanded
                ? <ChevronUp size={12} color="#a78bfa" />
                : <ChevronDown size={12} color="#64748b" />}
            </div>
          </div>
        </div>

        {/* Modelo — una línea bajo el nombre */}
        {displayModel && displayModel !== displayName && (
          <div style={{
            fontSize: 8.5, color: '#818cf8', marginTop: 3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }} title={displayModel}>
            {displayModel}
          </div>
        )}
      </div>

      {/* ── Detalle expandido ── */}
      {expanded && (
        <div style={{
          padding: '0 11px 10px',
          borderTop: '1px solid rgba(167,139,250,0.12)',
        }}>
          <div style={{ paddingTop: 8 }}>

            {/* Noise */}
            {cs?.noiseFloor != null && (
              <CpeRow label="Noise" value={`${cs.noiseFloor} dBm`} />
            )}

            {/* TX / RX rates */}
            {(cs?.txRate != null || cs?.rxRate != null) && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 5, marginTop: 2 }}>
                {cs?.txRate != null && (
                  <div style={{
                    flex: 1, background: 'rgba(99,102,241,0.1)', borderRadius: 5, padding: '3px 5px',
                    textAlign: 'center', fontSize: 8,
                  }}>
                    <div style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: .6 }}>TX Rate</div>
                    <div style={{ color: '#a5b4fc', fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>
                      {Number(cs.txRate).toFixed(1)} Mbps
                    </div>
                  </div>
                )}
                {cs?.rxRate != null && (
                  <div style={{
                    flex: 1, background: 'rgba(99,102,241,0.1)', borderRadius: 5, padding: '3px 5px',
                    textAlign: 'center', fontSize: 8,
                  }}>
                    <div style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: .6 }}>RX Rate</div>
                    <div style={{ color: '#a5b4fc', fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>
                      {Number(cs.rxRate).toFixed(1)} Mbps
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Throughput */}
            {(cs?.throughputTxKbps != null || cs?.throughputRxKbps != null) && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                {cs?.throughputTxKbps != null && (
                  <div style={{
                    flex: 1, background: 'rgba(34,211,238,0.07)', borderRadius: 5, padding: '3px 5px',
                    textAlign: 'center', fontSize: 8,
                  }}>
                    <div style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: .6 }}>↑ Thr</div>
                    <div style={{ color: '#67e8f9', fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>
                      {(cs.throughputTxKbps / 1000).toFixed(2)} Mbps
                    </div>
                  </div>
                )}
                {cs?.throughputRxKbps != null && (
                  <div style={{
                    flex: 1, background: 'rgba(34,211,238,0.07)', borderRadius: 5, padding: '3px 5px',
                    textAlign: 'center', fontSize: 8,
                  }}>
                    <div style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: .6 }}>↓ Thr</div>
                    <div style={{ color: '#67e8f9', fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>
                      {(cs.throughputRxKbps / 1000).toFixed(2)} Mbps
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AirMax M5 */}
            {hasAirMaxM5 && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                {cs?.airmaxQuality != null && (
                  <CpeTag label="AM Quality" value={`${cs.airmaxQuality}%`} color="#34d399" />
                )}
                {cs?.airmaxCapacity != null && (
                  <CpeTag label="AM Cap" value={`${cs.airmaxCapacity}%`} color="#34d399" />
                )}
                {cs?.airmaxSignal != null && (
                  <CpeTag label="AM Sig" value={`${cs.airmaxSignal} dBm`} color="#34d399" />
                )}
              </div>
            )}

            {/* AirMax AC */}
            {hasAirMaxAC && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                {cs?.airmaxDcap != null && (
                  <CpeTag label="DL Cap" value={`${cs.airmaxDcap} Mbps`} color="#22d3ee" />
                )}
                {cs?.airmaxUcap != null && (
                  <CpeTag label="UL Cap" value={`${cs.airmaxUcap} Mbps`} color="#22d3ee" />
                )}
                {cs?.airmaxCinrRx != null && (
                  <CpeTag label="CINR↓" value={`${cs.airmaxCinrRx} dB`} color="#a78bfa" />
                )}
                {cs?.airmaxCinrTx != null && (
                  <CpeTag label="CINR↑" value={`${cs.airmaxCinrTx} dB`} color="#a78bfa" />
                )}
              </div>
            )}

            {cs?.distance      != null && <CpeRow label="Distancia"  value={`${cs.distance} m`} />}
            {cs?.txLatency     != null && <CpeRow label="Latencia"   value={`${cs.txLatency} ms`} />}
            {cs?.txPower       != null && <CpeRow label="TX Power"   value={`${cs.txPower} dBm`} />}
            {cs?.remoteCpuLoad != null && <CpeRow label="CPU"        value={`${cs.remoteCpuLoad}%`} />}
            {cs?.remoteDistance   != null && <CpeRow label="Dist CPE"  value={`${cs.remoteDistance} m`} />}
            {cs?.remoteTxLatency  != null && <CpeRow label="Lat CPE"   value={`${cs.remoteTxLatency} ms`} />}
            {cs?.uptimeStr        && <CpeRow label="Uptime"     value={cs.uptimeStr} />}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '4px 11px 5px',
        borderTop: '1px solid rgba(71,85,105,0.15)',
        fontSize: 7.5, fontWeight: 800, letterSpacing: 1.1,
        textTransform: 'uppercase', color: expanded ? '#a78bfa' : '#475569',
        textAlign: 'center', transition: 'color .2s',
        cursor: 'pointer',
      }} onClick={() => setExpanded(e => !e)}>
        {expanded ? '▲ cerrar' : '▼ ver más'}
      </div>
    </div>
  );
}

/* ── CPE row helper ── */
function CpeRow({ label, value, valueEl }: { label: string; value?: string; valueEl?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
      <span style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: .8 }}>{label}</span>
      {valueEl ?? <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'JetBrains Mono,monospace' }}>{value}</span>}
    </div>
  );
}

/* ── CPE tag (mini badge) ── */
function CpeTag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: 1, borderRadius: 5, padding: '2px 4px', textAlign: 'center', fontSize: 7.5,
      background: `${color}14`, border: `1px solid ${color}30`,
    }}>
      <div style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: .5 }}>{label}</div>
      <div style={{ color, fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

/* ── Info line helper ── */
function InfoLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
      <span style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: .8, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontSize: 9, color: '#94a3b8', fontFamily: 'JetBrains Mono,monospace',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  );
}

/* ── Stat pill ── */
function Pill({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
      borderRadius: 8, background: 'rgba(30,35,55,0.5)', border: '1px solid rgba(71,85,105,0.4)',
      fontSize: 11,
    }}>
      <Circle size={7} color={color} fill={color} />
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
                          VISTA NIVEL 2 — Detalle de nodo
   ══════════════════════════════════════════════════════════════════════════ */
function DetailView({
  node,
  devices,
  onBack,
}: {
  node: NodeInfo;
  devices: SavedDevice[];
  onBack: () => void;
}) {
  const isAp = (d: SavedDevice) =>
    d.role === 'ap' ||
    (d.role === 'unknown' && (
      d.cachedStats?.mode?.startsWith('ap') ||
      d.cachedStats?.mode === 'master'
    ));
  const aps  = devices.filter(isAp);
  const stas = devices.filter(d => !isAp(d));

  // Build columns: each AP + its matched CPEs
  const columns = useMemo(() => {
    const used = new Set<string>();
    const cols = aps.map(ap => {
      const cpes = stas.filter(s => matchStaToAp(s, ap));
      cpes.forEach(c => used.add(c.id));
      return { ap, cpes };
    });
    const orphans = stas.filter(s => !used.has(s.id));
    return { cols, orphans };
  }, [aps, stas]);

  const isEmpty = aps.length === 0 && stas.length === 0;

  return (
    <div style={{ fontFamily: "'Exo 2',sans-serif" }}>
      {/* Breadcrumb */}
      <div style={{
        padding: '10px 20px',
        background: 'rgba(10,15,28,0.9)',
        borderBottom: '1px solid rgba(99,102,241,0.15)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 8,
          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
          color: '#a5b4fc', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          transition: 'all .2s',
          fontFamily: "'Exo 2',sans-serif",
        }}>
          <ArrowLeft size={12} />
          Nodos
        </button>
        <span style={{ color: '#334155', fontSize: 11 }}>/</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: node.running ? '#34d399' : '#475569',
            boxShadow: node.running ? '0 0 6px #34d399' : 'none',
            animation: node.running ? 'topo-blink 2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>
            {node.nombre_nodo}
          </span>
          <span style={{ fontSize: 10, color: '#22d3ee', fontFamily: 'JetBrains Mono,monospace' }}>
            {node.ip_tunnel}
          </span>
        </div>
<div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 10, color: '#475569', alignItems: 'center' }}>
            <span><span style={{ color: '#818cf8', fontWeight: 700 }}>{aps.length}</span> APs</span>
            <span><span style={{ color: '#a78bfa', fontWeight: 700 }}>{stas.length}</span> CPEs</span>
            
            <button onClick={async () => {
              if (window.confirm('¿Seguro que deseas borrar la caché de topología (IndexedDB)? La app se recargará.')) {
                try {
                  await cpeCache.clear();
                  window.location.reload();
                } catch (e) {
                  console.error('Error clearing cache:', e);
                }
              }
            }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              transition: 'all .2s', marginLeft: 12
            }}>
              <Trash2 size={12} />
              Borrar Caché Topología
            </button>
          </div>
        </div>

        {/* Tree View */}
        <div style={{
          padding: '32px 28px 36px',
          background: '#070b14',
          minHeight: 420,
          backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.13) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}>
          {isEmpty ? (
            <div style={{
              height: 340, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
            }}>
              <Radio size={40} color="#334155" />
              <p style={{ color: '#475569', fontSize: 13 }}>
                No hay dispositivos registrados en este nodo
              </p>
            </div>
          ) : (
            <TowerContainer
              towerName={"Torre: " + node.nombre_nodo}
              nodeDevice={<NodeCard node={node} deviceCount={aps.length} onClick={() => {}} />}
            >
              {aps.length > 0 && (
                <CollapsibleNode
                  title={
                    <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600 }}>
                      Access Points ({aps.length})
                    </div>
                  }
                  levelLabel="Access Points"
                  defaultOpen={false}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {columns.cols.map(({ ap, cpes }) => (
                      <CollapsibleNode
                        key={ap.id}
                        title={<ApCard device={ap} cpeCount={cpes.length} />}
                        levelLabel={`CPEs (${cpes.length})`}
                        defaultOpen={false}
                      >
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, paddingLeft: 12 }}>
                          {cpes.length === 0 ? (
                            <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>Sin CPEs conectados</div>
                          ) : (
                            cpes.map(cpe => <CpeCard key={cpe.id} device={cpe} />)
                          )}
                        </div>
                      </CollapsibleNode>
                    ))}
                  </div>
                </CollapsibleNode>
              )}

              {columns.orphans.length > 0 && (
                <CollapsibleNode
                  title={
                    <div style={{ color: '#f87171', fontSize: 14, fontWeight: 600 }}>
                      CPEs Huérfanos ({columns.orphans.length})
                    </div>
                  }
                  levelLabel="Sin AP identificado"
                  defaultOpen={true}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, paddingLeft: 12 }}>
                    {columns.orphans.map(cpe => <CpeCard key={cpe.id} device={cpe} />)}
                  </div>
                </CollapsibleNode>
              )}
            </TowerContainer>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
                          MÓDULO PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════ */
export default function NetworkTopologyModule() {
  const { nodes: vpnNodes, credentials } = useVpn();
  const [devices,  setDevices]  = useState<SavedDevice[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [pollMsg,  setPollMsg]  = useState<string | null>(null);
  const [view,     setView]     = useState<'nodes' | 'detail'>('nodes');
  const [selId,    setSelId]    = useState<string | null>(null);

  // ── Carga rápida desde cache (sin poll) ──────────────────────────────────
  const load = useCallback(async (clearCache = false) => {
    setLoading(true);
    setPollMsg(null);

    // 1. Carga dispositivos desde SQLite del servidor (APs + devices con SSH)
    const devs = await deviceDb.load();

    // 2a. Extrae CPEs desde cachedStats.stations de APs que ya tienen SSH data
    const apsWithStations = devs.filter(d =>
      (d.role === 'ap' || (d.role === 'unknown' && (d.cachedStats?.mode?.startsWith('ap') || d.cachedStats?.mode === 'master'))) &&
      d.cachedStats?.stations?.length
    );
    if (apsWithStations.length > 0) {
      await extractAndPersistCpes(apsWithStations, devs);
    }

    // 2b. Si clearCache, borramos el cache viejo de IndexedDB antes de recargar
    if (clearCache) await cpeCache.clear();

    // 2c. Carga CPEs desde /api/ap-monitor/topology-cpes (wstalist poller)
    await loadAndCacheCpesFromServer(devs);

    // 3. Carga todos los CPEs guardados en IndexedDB
    const cachedCpes = await cpeCache.load();

    // 4. Fusiona: devices de SQLite + CPEs de IndexedDB (sin duplicar por id)
    const sqliteIds = new Set(devs.map(d => d.id));
    const extraCpes = cachedCpes.filter(c => !sqliteIds.has(c.id));
    setDevices([...devs, ...extraCpes]);

    setLoading(false);
  }, []);

  // ── Actualizar: poll todos los APs (devices + AP Monitor), luego recarga ─
  const pollAndRefresh = useCallback(async () => {
    setLoading(true);

    // 1. Pollea APs del AP Monitor (tabla aps) — incluye M5 y AC
    setPollMsg('Polleando AP Monitor…');
    try {
      await apiFetch(`${API_BASE_URL}/api/ap-monitor/poll-all-monitor`, { method: 'POST' });
    } catch { /* ignora si el servidor no responde */ }

    // 2. Pollea APs del módulo Escanear (tabla devices, con SSH directo)
    const devs = await deviceDb.load();
    const aps  = devs.filter(d =>
      (d.role === 'ap' || (d.role === 'unknown' && (d.cachedStats?.mode?.startsWith('ap') || d.cachedStats?.mode === 'master'))) &&
      d.sshUser && d.ip
    );
    if (aps.length > 0) {
      let done = 0;
      await Promise.allSettled(aps.map(async (ap) => {
        try {
          await apiFetch(`${API_BASE_URL}/api/ap-monitor/poll-direct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apId:     ap.id,
              ip:       ap.ip,
              port:     ap.sshPort ?? 22,
              user:     ap.sshUser ?? '',
              pass:     ap.sshPass ?? '',
              firmware: ap.firmware ?? '',
              saveHistory: false,
            }),
          });
        } catch { /* ignora fallos individuales */ }
        done++;
        setPollMsg(`Polleando APs SSH… ${done}/${aps.length}`);
      }));
    }

    setPollMsg('Recargando…');
    await load(true);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  /* ── stats ── */
  const onlineCount  = vpnNodes.filter(n => n.running).length;
  const offlineCount = vpnNodes.length - onlineCount;
  const apCount      = devices.filter(d => d.role === 'ap' || (d.role === 'unknown' && (d.cachedStats?.mode?.startsWith('ap') || d.cachedStats?.mode === 'master'))).length;
  const staCount     = devices.filter(d => d.role === 'sta').length;

  /* ── derived ── */
  // Group devices by nodeName (reliable link between ap_groups and VPN nodes)
  const devicesByNodeName = useMemo(() =>
    devices.reduce<Record<string, SavedDevice[]>>((acc, d) => {
      const key = d.nodeName || d.nodeId;
      (acc[key] ??= []).push(d);
      return acc;
    }, {}),
  [devices]);

  const selectedNode = vpnNodes.find(n => n.id === selId);
  const nodeDevices  = selectedNode ? (devicesByNodeName[selectedNode.nombre_nodo] ?? []) : [];

  const openDetail = (id: string) => { setSelId(id); setView('detail'); };
  const goBack     = () => { setView('nodes'); setSelId(null); };

  /* ══════════════════════════════════════════════════════════
                           RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes topo-blink {
          0%,100% { opacity:1; }
          50%      { opacity:.45; }
        }
      `}</style>

      <div style={{
        fontFamily: "'Exo 2',sans-serif",
        background: '#070b14',
        borderRadius: 20,
        overflow: 'hidden',
        border: '1px solid rgba(99,102,241,0.2)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}>

        {/* ── Topbar ── */}
        <div style={{
          padding: '14px 20px',
          background: 'rgba(15,20,38,0.97)',
          borderBottom: '1px solid rgba(99,102,241,0.15)',
          display: 'flex', flexWrap: 'wrap', gap: 12,
          alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} color="#818cf8" />
              <span style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0', letterSpacing: .3 }}>
                Topología de Red
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#475569', fontFamily: 'JetBrains Mono,monospace', marginTop: 2 }}>
              {credentials?.ip} &nbsp;·&nbsp; {vpnNodes.length} nodos &nbsp;·&nbsp; {devices.length} dispositivos
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Pill color="#34d399" label="Online"  value={onlineCount}  />
            <Pill color="#475569" label="Offline" value={offlineCount} />
            <Pill color="#818cf8" label="APs"     value={apCount}      />
            <Pill color="#a78bfa" label="CPEs"    value={staCount}     />
            {pollMsg && (
              <span style={{ fontSize: 9.5, color: '#67e8f9', fontFamily: 'JetBrains Mono,monospace' }}>
                {pollMsg}
              </span>
            )}
            <button onClick={() => { pollAndRefresh(); }} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)',
              color: '#a5b4fc', cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Exo 2',sans-serif",
            }}>
              <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              Actualizar
            </button>
          </div>
        </div>

        {/* ── Contenido ── */}
        {view === 'nodes' ? (
          /* ── NIVEL 1: Nodos ── */
          <div style={{
            overflowX: 'auto',
            overflowY: 'auto',
            padding: '32px 28px 36px',
            background: '#070b14',
            minHeight: 340,
            backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.12) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}>
            {vpnNodes.length === 0 ? (
              <div style={{
                height: 280, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 12,
              }}>
                <Activity size={40} color="#334155" />
                <p style={{ color: '#475569', fontSize: 13 }}>No hay nodos registrados</p>
              </div>
            ) : (
              <>
                {/* Router badge */}
                <div style={{
                  display: 'flex', justifyContent: 'center', marginBottom: 28,
                }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: '10px 18px',
                    background: 'linear-gradient(135deg,#0f1428 0%,#151c35 100%)',
                    border: '1.5px solid rgba(99,102,241,0.6)',
                    borderRadius: 14,
                    boxShadow: '0 0 24px rgba(99,102,241,0.2)',
                    fontFamily: "'Exo 2',sans-serif",
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Server size={17} color="#818cf8" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', letterSpacing: .3 }}>
                        MikroTik Router
                      </div>
                      <div style={{ fontSize: 9.5, color: '#6366f1', fontFamily: 'JetBrains Mono,monospace', marginTop: 1 }}>
                        {credentials?.ip}
                      </div>
                    </div>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#34d399', boxShadow: '0 0 8px #34d399',
                      animation: 'topo-blink 2s ease-in-out infinite',
                      marginLeft: 4,
                    }} />
                  </div>
                </div>

                {/* Connector lines from router to nodes (decorative) */}
                <div style={{
                  display: 'flex', justifyContent: 'center', marginBottom: 12,
                }}>
                  <div style={{
                    width: Math.min(vpnNodes.length * 232, 1200),
                    height: 24,
                    position: 'relative',
                    flexShrink: 0,
                  }}>
                    {/* Horizontal bar */}
                    {vpnNodes.length > 1 && (
                      <div style={{
                        position: 'absolute',
                        top: 0, left: '50%', transform: 'translateX(-50%)',
                        width: `${((vpnNodes.length - 1) / vpnNodes.length) * 100}%`,
                        height: 2,
                        background: 'linear-gradient(90deg,transparent,rgba(34,211,238,0.3),rgba(34,211,238,0.3),transparent)',
                      }} />
                    )}
                    {/* Vertical ticks */}
                    {vpnNodes.map((_, i) => (
                      <div key={i} style={{
                        position: 'absolute',
                        top: 0, bottom: 0,
                        left: `${(i + 0.5) / vpnNodes.length * 100}%`,
                        width: 2,
                        background: vpnNodes[i].running
                          ? 'rgba(34,211,238,0.45)'
                          : 'rgba(71,85,105,0.35)',
                        borderRadius: 2,
                      }} />
                    ))}
                  </div>
                </div>

                {/* Node cards row */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 20,
                  justifyContent: vpnNodes.length <= 5 ? 'center' : 'flex-start',
                  flexWrap: 'nowrap',
                }}>
                  {vpnNodes.map(n => (
                    <NodeCard
                      key={n.id}
                      node={n}
                      deviceCount={(devicesByNodeName[n.nombre_nodo] ?? []).length}
                      onClick={() => openDetail(n.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          /* ── NIVEL 2: Detalle de nodo ── */
          selectedNode ? (
            <DetailView
              node={selectedNode}
              devices={nodeDevices}
              onBack={goBack}
            />
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#475569' }}>
              Nodo no encontrado.{' '}
              <button onClick={goBack} style={{ color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer' }}>
                Volver
              </button>
            </div>
          )
        )}

        {/* ── Leyenda ── */}
        <div style={{
          padding: '10px 20px',
          background: 'rgba(8,12,22,0.97)',
          borderTop: '1px solid rgba(99,102,241,0.1)',
          display: 'flex', flexWrap: 'wrap', gap: '6px 18px', alignItems: 'center',
        }}>
          {[
            { color: '#6366f1', label: 'Router MikroTik' },
            { color: '#22d3ee', label: 'Nodo online',  pulse: true },
            { color: '#334155', label: 'Nodo offline' },
            { color: '#818cf8', label: 'AP' },
            { color: '#a78bfa', label: 'CPE / STA' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#64748b' }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', background: item.color,
                boxShadow: item.pulse ? `0 0 5px ${item.color}` : 'none',
              }} />
              {item.label}
            </div>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 10, color: '#334155' }}>
            {view === 'nodes' ? 'Click en un nodo para ver sus APs y CPEs' : 'Scroll horizontal para ver todos los APs'}
          </div>
        </div>
      </div>
    </>
  );
}
