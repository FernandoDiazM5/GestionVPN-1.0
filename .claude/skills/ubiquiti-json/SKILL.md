---
name: ubiquiti-json
description: Use this skill whenever the user is working with Ubiquiti airOS data: parsing /status.cgi or mca-status output, AntennaStats fields, signal/CCQ/txRate values, station lists, wstalist data, or adding new fields from airOS M-series or AC-series firmware. Also trigger when the user asks why a field is null, why signal/CCQ/model is missing, how to access a specific airOS metric, or wants to fix the parser. If the user mentions mca-status, mca-cli-op, wstalist, status.cgi, airOS, LiteBeam, NanoStation, parseAirOSStats, parseFullOutput, parseWstalist, parseMcaCli, or AntennaStats, use this skill immediately.
---

# Ubiquiti airOS — JSON, Parseo y Arquitectura

## Pipeline Completo de Parseo

`ANTENNA_CMD` ejecuta 12 comandos en una sola sesión SSH, delimitados por marcadores. `parseFullOutput` extrae cada sección y las fusiona:

```
SSH exec → ANTENNA_CMD
│
├── __MCA__   mca-status        → parseAirOSStats()   → base (señal, CCQ, rates, airmax...)
├── __CFG__   /tmp/system.cfg   → parseSystemCfg()    → modo, SSID, seguridad, freq
├── __HN__    /proc/.../hostname→ s1('HN')            → deviceName (más confiable)
├── __VER__   /etc/version      → s1('VER')           → firmwareVersion (1ª línea)
├── __IFC__   ifconfig          → parseIfconfig()     → wlanMac, lanMac
├── __MCACLI__ mca-cli-op info  → parseMcaCli()       → deviceModel human-readable ← CRÍTICO
├── __WSTA__  wstalist          → parseWstalist()     → stations[] fallback (AP mode)
├── __IWCFG__ iwconfig ath0     → parseIwconfigData() → apMac, signal, txRate fallback
├── __MEMINFO__ /proc/meminfo   → parseMeminfo()      → memTotalKb, memFreeKb...
└── __NETDEV__ /proc/net/dev    → parseNetDev()       → ifaceTraffic
```

**Prioridad de merge** (la primera fuente no-nula gana):
- `deviceModel`: `mca-status JSON` > `mca-cli-op info`
- `deviceName`: `/proc/hostname` > `mca-status` > `system.cfg` > `mca-cli-op`
- `firmwareVersion`: `/etc/version` > `mca-status` > `mca-cli-op`
- `uptimeStr`: `mca-status` (calculado) > `mca-cli-op` (pre-formateado)
- `stations[]`: `mca-status data.sta[]` > `wstalist` (fallback cuando data.sta está vacío)

---

## Diferencias Críticas por Fuente de Datos

### `mca-status` JSON (sección `__MCA__`)

Fuente principal. Estructura raíz:
```json
{
  "host":      { ... },
  "wireless":  { ... },
  "airmax":    { ... },   ← AC-series: raíz. M-series: PUEDE estar en wireless.airmax
  "interfaces": [ ... ],
  "sta":       [ ... ]    ← estaciones (solo modo AP)
}
```

**M-series XW/XM (airOS 5.x–6.x)**: `airmax` puede estar anidado en `wireless`:
```json
{ "wireless": { "airmax": { "quality": 85, "capacity": 45, "enabled": true } } }
```
El parser YA maneja esto: `data.airmax || w.airmax || {}`.

**Problema conocido**: En algunos dispositivos `mca-status` emite texto extra antes del JSON (banner BusyBox, warnings). El parser extrae el bloque `{...}` aunque haya prefijos.

### `mca-cli-op info` (sección `__MCACLI__`)

**Fuente del modelo human-readable**. Ejemplo de salida:
```
Model:                LiteBeam M5
Version:              WA.ar934x.v6.1.7.32555.180523.1754
DevName:              INTERNET SAYURY ALIGA IBARRA
Uptime(secs):         905305
Uptime:               10d 04:28:25
```

Esto resuelve el bug donde `host.devmodel` da el código interno (`LBE-M5`) en lugar del nombre completo (`LiteBeam M5`).

### `wstalist` (sección `__WSTA__`) — ESCALA DIFERENTE

**¡Atención!** `wstalist` usa escalas distintas a `mca-status`:

| Campo | mca-status `sta[]` | wstalist |
|-------|-------------------|----------|
| `ccq` | ×10 (960 = 96%) | 0–100 (92 = 92%) — NO dividir |
| `txrate`/`rxrate` | kbps (150000 = 150 Mbps) | — no existe |
| `tx`/`rx` | — no existe | float Mbps (72.222 = 72 Mbps) |
| `signal` | dBm | dBm |
| `name` | — | nombre display de la estación |
| `remote.platform` | — | modelo human-readable de la estación remota |
| `remote.hostname` | — | hostname de la estación remota |
| `lastip` | — | última IP asignada |
| `airmax.quality` | — | calidad airMAX por estación (0–100) |

Ejemplo de entrada `wstalist` (de `stat.cgi.json` real del proyecto):
```json
[{
  "mac": "18:E8:29:D8:7B:2E",
  "name": "GAEL NETTV_ SE",
  "lastip": "142.152.7.212",
  "tx": 72.222,
  "rx": 58.500,
  "signal": -51,
  "ccq": 92,
  "tx_latency": 2,
  "uptime": 625016,
  "txpower": 18,
  "noisefloor": -94,
  "airmax": { "priority": 3, "quality": 0, "capacity": 0 },
  "remote": {
    "hostname": "GAEL NETTV_ SECTPOWER/VILLA-UNO",
    "platform": "PowerBeam M5 300",
    "version": "XW.ar934x.v6.1.7.32555.180523.1754",
    "netrole": "bridge"
  }
}]
```

---

## Campos de `mca-status` JSON — M-series (XW firmware v5.x–6.x)

```json
{
  "host": {
    "hostname":  "INTERNET SAYURY ALIGA IBARRA",
    "devmodel":  "LBE-M5",              ← código interno; usar mca-cli-op para nombre completo
    "fwversion": "XW.ar934x.v6.1.7.32555.180523.1754",
    "fwprefix":  "XW",
    "macaddr":   "24:5A:4C:4E:79:1E",
    "uptime":    905305,                ← segundos
    "cpuload":   14,                    ← %
    "memtotal":  61440,                 ← KB (M-series usa memtotal/memfree, NO memory.total)
    "memfree":   37171,
    "time":      "2018-06-02 10:22:19"
  },
  "wireless": {
    "mode":      "sta",                 ← "ap" | "sta" | "apauto" | "ap-ptp" | "ap-ptmp"
    "essid":     "FIWIS_FABIANITO/LAPGPS/CRISTIAN",
    "frequency": 5435,
    "chanbw":    40,
    "chanbwcfg": "ht40minus",           ← "ht40minus" | "ht40plus" | "ht20"
    "txpower":   20,
    "signal":    -50,
    "noisefloor":-91,
    "ccq":       842,                   ← ×10; 842 = 84.2%
    "txrate":    135000,                ← kbps; 135000 = 135 Mbps
    "rxrate":    150000,
    "security":  "WPA2-AES",
    "chains":    1,
    "txchains":  1,
    "ackdistance": 200,                 ← metros
    "remote": { "mac": "68:D7:9A:B8:7F:A3", "hostname": "AP-Torres" },
    "airmax": {                         ← en M-series está AQUÍ dentro de wireless
      "quality":  85,
      "capacity": 45,
      "enabled":  true,
      "priority": "base"
    }
  }
}
```

## Campos de `mca-status` JSON — AC-series (WA firmware v8.x)

Diferencias principales vs M-series:
- `host.memory` es objeto `{ total, free, buffers, cached }` (NO `memtotal`/`memfree`)
- `airmax` está en raíz (NO en `wireless.airmax`)
- Campos adicionales: `temperature`, `loadavg`, `height`, `polling`, `chain_names`

---

## AntennaStats — Shape Completo Organizado

### Grupo 1: RF en Tiempo Real (variable, no se persiste)
```typescript
signal?: number;          // dBm — señal RX (-50 = fuerte, -80 = débil)
noiseFloor?: number;      // dBm — piso de ruido (-91 = bueno)
ccq?: number;             // 0–100 % — calidad de conexión
txRate?: number;          // Mbps — velocidad TX
rxRate?: number;          // Mbps — velocidad RX
cpuLoad?: number;         // 0–100 %
memoryPercent?: number;   // 0–100 %
uptimeStr?: string;       // "10d 04:28:25"
deviceDate?: string;      // "2018-06-02 10:22:19"
```

### Grupo 2: airMAX (variable, no se persiste)
```typescript
airmaxQuality?: number;   // 0–100 %
airmaxCapacity?: number;  // 0–100 %
airmaxEnabled?: boolean;
airmaxPriority?: string;  // "base" | "high" | "medium" | "low"
```

### Grupo 3: Estaciones Conectadas (solo modo AP)
```typescript
stations?: Array<{
  mac: string;
  signal?: number | null;
  noiseFloor?: number | null;
  ccq?: number | null;
  txRate?: number | null;
  rxRate?: number | null;
  distance?: number | null;
  uptime?: number | null;
  txLatency?: number | null;     // ms
  txPower?: number | null;       // dBm TX de la estación
  hostname?: string | null;      // nombre del equipo remoto
  remoteModel?: string | null;   // modelo (wstalist remote.platform)
  lastIp?: string | null;        // última IP
  airmaxQuality?: number | null;
  airmaxCapacity?: number | null;
}>;
```

### Grupo 4: Identificación (estático, se guarda en SavedDevice)
```typescript
deviceName?: string;       // hostname airOS
deviceModel?: string;      // "LiteBeam M5" — viene de mca-cli-op info
firmwareVersion?: string;  // "WA.ar934x.v6.1.7.32555.180523.1754" — string raw
fwPrefix?: string;         // "XW" | "WA" | "XM"
wlanMac?: string;          // MAC de ath0/wlan0
lanMac?: string;           // MAC de eth0/br0
apMac?: string;            // MAC del AP remoto (solo modo STA)
```

### Grupo 5: RF Estático (estático, se guarda en SavedDevice)
```typescript
essid?: string;
security?: string;         // "WPA2-AES", "WPA2", "none"
mode?: string;             // "sta" | "ap"
networkMode?: string;      // "router" | "bridge"
frequency?: number;        // MHz
channelNumber?: number;    // número de canal (ej: 87)
channelWidth?: number;     // MHz (20 | 40 | 80)
channelWidthExt?: string;  // "Inferior (HT40-)" | "Superior (HT40+)"
freqRange?: string;        // "5405 - 5445 MHz"
txPower?: number;          // dBm
distance?: number;         // metros (ackdistance)
chains?: string;           // "1X1" | "2X2"
antenna?: string;          // "Feed only - 3 dBi"
lanSpeed?: number;         // Mbps
lanInfo?: string;          // "100Mbps-Full" | "100Mbps-Completo"
```

### Grupo 6: M-series específico
```typescript
rssi?: number;
txRetries?: number;
missedBeacons?: number;
chainRssi?: number[];
atpcStatus?: string;
airsyncMode?: string;
opmode?: string;           // "11NAHT20"
countryCode?: string;
```

### Grupo 7: AC-series específico
```typescript
temperature?: number;      // °C
antennaGain?: number;      // dBi
centerFreq1?: number;
txIdx?: number;
rxIdx?: number;
txNss?: number;
rxNss?: number;
txChainmask?: number;
cinr?: number;
dcap?: number;             // download capacity %
ucap?: number;             // upload capacity %
airtime?: number;
txLatency?: number;
```

### Grupo 8: Memoria Detallada (/proc/meminfo)
```typescript
memTotalKb?: number;
memFreeKb?: number;
memBuffersKb?: number;
memCachedKb?: number;
```

### Grupo 9: Tráfico por Interfaz (/proc/net/dev)
```typescript
ifaceTraffic?: Record<string, {
  rxBytes: number; rxPackets: number;
  txBytes: number; txPackets: number;
}>;
```

### Grupo 10: Raw (solo sesión, NO se persiste)
```typescript
_rawJson?: string;       // JSON crudo de mca-status (hasta 8000 chars)
_rawUname?: string;
_rawRoutes?: string;
_rawIwconfig?: string;
_rawWstalist?: string;
_rawMcaCli?: string;
_rawNetDev?: string;
_rawMeminfo?: string;
```

---

## Conversiones Importantes

### CCQ
- `mca-status` `wireless.ccq`: valor ×10 → dividir entre 10: `842 → 84.2%`
- `wstalist` `ccq`: ya es 0–100 → usar directo: `92 → 92%`
- El parser `parseAirOSStats` aplica `÷10` a `data.sta[].ccq` (correcto para mca-status)
- El parser `parseWstalist` usa `parseFloat(s.ccq)` directo (correcto para wstalist)

### TX/RX Rate
- `mca-status` `wireless.txrate`: kbps → `150000 → 150 Mbps`
- `wstalist` `tx`/`rx`: ya en Mbps float → `72.222 → 72.2 Mbps`
- Heurística: `> 1_700_000 → ÷1_000_000 (bps)`, `> 1_700 → ÷1_000 (kbps)`, `≤ 1_700 → ya Mbps`

### ChannelWidthExt (M-series)
`chanbwcfg` toma valores como `"ht40minus"` (sin guion). El regex cubre:
- `"ht40minus"`, `"HT40MINUS"`, `"HT40-"`, `"BELOW"` → `"Inferior (HT40-)"`
- `"ht40plus"`, `"HT40PLUS"`, `"HT40+"`, `"ABOVE"` → `"Superior (HT40+)"`

### Memoria
- M-series: `host.memtotal` / `host.memfree` (KB directos en JSON raíz de host)
- AC-series: `host.memory.total` / `host.memory.free` (objeto anidado)
- `memoryPercent` el parser calcula ambos casos
- `memTotalKb`/`memFreeKb` vienen del merge con `/proc/meminfo`

---

## Añadir un Nuevo Campo

1. Localizar en `_rawJson` el nombre del campo en el JSON real del dispositivo
2. Agregar extracción en `parseAirOSStats()` en `ubiquiti.service.js`:
   ```js
   newField: pn(w, 'campo_v8', 'campo_v6') != null ? parseInt(pn(w, 'campo_v8', 'campo_v6')) : null,
   ```
3. Agregar al tipo `AntennaStats` en `vpn-manager/src/types/devices.ts` en el grupo correcto
4. Usar en componente: `dev.cachedStats?.newField ?? null`

## Roles de Dispositivo

| `wireless.mode` en JSON | `role` en `ScannedDevice` |
|------------------------|--------------------------|
| `ap`, `apauto`, `ap-ptp`, `ap-ptmp`, `master` | `'ap'` — tiene `stations[]` |
| `sta`, `managed`, `station` | `'sta'` — tiene `apMac` |
| ausente | `'unknown'` |
