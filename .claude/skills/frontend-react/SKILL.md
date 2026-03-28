---
name: frontend-react
description: Use this skill whenever the user is working on the React frontend of this project. Trigger for: adding or editing components, fixing TypeScript errors in .tsx files, modifying VpnContext, working with the device table or node cards, updating state management, adding Tailwind styles, using Lucide icons, working with IndexedDB (deviceDb), handling fetch calls from the frontend, or any UI question. Also trigger when the user mentions NetworkDevicesModule, NodeCard, NodeAccessPanel, VpnContext, DeviceCard, or any file inside vpn-manager/src/.
---

# Frontend — React 19 + TypeScript + Vite

## Stack

| Tool | Uso |
|------|-----|
| React 19 | Solo hooks, sin class components |
| TypeScript strict | Nunca `any` — usar `unknown` + narrowing |
| Vite | Dev server `:5173` |
| Tailwind CSS v4 | Solo utility classes |
| Lucide React | Iconos — import individual |

## Estructura

```
vpn-manager/src/
├── components/
│   ├── NetworkDevicesModule.tsx  — tabla antenas Ubiquiti + escaneo
│   ├── NodeCard.tsx              — tarjeta por nodo VPN (SSTP)
│   ├── NodeAccessPanel.tsx       — panel lateral de acceso VPN
│   └── DeviceCard.tsx            — modal detalles completos de antena
├── context/
│   └── VpnContext.tsx            — estado global: auth, nodos, módulo activo
├── store/
│   ├── db.ts                     — IndexedDB credenciales RouterOS
│   └── deviceDb.ts               — IndexedDB dispositivos Ubiquiti guardados
├── types/
│   ├── api.ts                    — tipos respuestas backend Express
│   └── devices.ts                — ScannedDevice, SavedDevice, AntennaStats
├── utils/
│   └── fetchWithTimeout.ts       — fetch con timeout
└── config.ts                     — API_BASE_URL = 'http://localhost:3001/api'
```

## VpnContext

```typescript
const {
  isAuthenticated, credentials,
  managedVpns, setManagedVpns,
  nodes, setNodes,                    // NodeInfo[]
  activeNodeVrf, setActiveNodeVrf,    // VRF activo
  tunnelExpiry, setTunnelExpiry,      // expiración 30 min
  adminIP, setAdminIP,
  deactivateAllNodes,
  activeModule, setActiveModule,      // 'nodes' | 'devices' | 'monitor'
  darkMode, toggleDarkMode,
} = useVpn();
```

- `activeNodeVrfRef` y `adminIPRef` evitan stale closures en el intervalo de keepalive
- `isReady` se activa después de que IndexedDB inicializa

## Patrones

### Fetch al backend
```typescript
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { API_BASE_URL } from '../config';

const res = await fetchWithTimeout(`${API_BASE_URL}/nodes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ip, user, pass }),
}, 10_000);
const data: NodeInfo[] = await res.json();
```
Nunca usar `fetch` directo — siempre `fetchWithTimeout`.

### IndexedDB para dispositivos
```typescript
import { deviceDb } from '../store/deviceDb';
await deviceDb.saveDevice(savedDevice);       // upsert por MAC
const devs = await deviceDb.getAllDevices();
await deviceDb.deleteDevice(mac);
```

### Añadir columna a NetworkDevicesModule
```typescript
{
  key: 'miCampo',
  label: 'Mi Label',
  width: 'minmax(80px,1fr)',
  defaultVisible: true,
  requiresStats: true,   // true = solo si cachedStats existe
  render: (dev) => {
    const v = dev.cachedStats?.miCampo;
    if (v == null) return <span className="text-slate-300">—</span>;
    return <span className="font-mono text-xs">{v}</span>;
  },
}
```

### Iconos Lucide
```typescript
import { Wifi, Router, Activity } from 'lucide-react';
<Wifi size={14} className="text-sky-500" />
```

## Tailwind — Convenciones del Proyecto

- Fondo: `bg-slate-50` (light) / `bg-slate-900` (dark)
- Texto: `text-slate-700` / `text-slate-200`
- Acento: `text-sky-600` / `bg-sky-500`
- OK: `text-emerald-600`, Warning: `text-amber-500`, Error: `text-red-500`
- Señal RF: `>= -65 dBm → emerald`, `-65 a -75 → sky`, `< -75 → amber`
- Datos numéricos (IPs, señal): `font-mono text-xs`
- Dark mode: `dark:` prefix, clase `dark` en `<html>`

## Errores Comunes

| Error | Causa | Fix |
|-------|-------|-----|
| `cachedStats` undefined | Dispositivo sin SSH aún | `dev.cachedStats?.signal ?? null` |
| Estado stale en interval | Closure captura valor viejo | Usar `ref` como `activeNodeVrfRef` |
| Tipo `any` en fetch | Respuesta sin tipar | Crear interface en `types/api.ts` |
| Columna no aparece | `defaultVisible: false` guardado | Limpiar `COLS_STORAGE_KEY` en localStorage |
