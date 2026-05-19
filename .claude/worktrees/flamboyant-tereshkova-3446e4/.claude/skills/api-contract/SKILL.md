---
name: api-contract
description: Use this skill whenever the user mentions TypeScript types drifting from backend routes, API contract mismatches, frontend calling wrong endpoints, type errors between server and client, or wants to sync types between Express and React. Also trigger when the user adds a new API endpoint and wants to update frontend types, or when TypeScript errors seem to come from a backend response shape mismatch. If the user is touching both server routes and frontend types at the same time, use this skill.
---

# API Contract — Sincronización Backend ↔ Frontend

## Contexto del Proyecto

- **Backend**: `server/api.routes.js` (Express, plain JS) — fuente de verdad del contrato
- **Tipos frontend**: `vpn-manager/src/types/api.ts` y `vpn-manager/src/types/devices.ts`
- **Fetch calls**: `vpn-manager/src/context/VpnContext.tsx` y componentes
- **Base URL**: `vpn-manager/src/config.ts` → `API_BASE_URL = 'http://localhost:3001/api'`

## Rutas Actuales y sus Tipos

| Ruta | Tipo de respuesta |
|------|------------------|
| POST `/connect` | `ConnectResponse` |
| POST `/diagnose` | `{ steps, authOk, authMsg, apiReachable }` |
| POST `/secrets` | `SecretEntry[]` |
| POST `/active` | `ActiveSession[]` |
| POST `/nodes` | `NodeInfo[]` |
| POST `/interface/activate` | `ActivateResponse` |
| POST `/interface/deactivate` | `DeactivateResponse` |
| POST `/device/scan` | `ScannedDevice[]` |
| POST `/device/antenna` | `AntennaStats` |

## Workflow — Detectar Drift

1. Leer `server/api.routes.js` — rastrear cada `res.json(...)` y extraer la forma exacta
2. Leer `vpn-manager/src/types/api.ts` — comparar campo por campo
3. Marcar discrepancias: campo faltante, tipo incorrecto, opcional vs requerido

## Campo `.id` de RouterOS — Regla Crítica

RouterOS devuelve items con `'.id'` (con punto). El backend ya mapea antes de enviar al frontend:
```js
// Backend mapea: item['.id'] → id
res.json(secrets.map(item => ({ id: item['.id'], name: item.name, ... })));
```
El frontend recibe `id` (sin punto). En `types/api.ts` el campo es `id: string`.

Si en alguna ruta el backend NO hace el mapeo, el frontend recibirá `undefined` al leer `.id`.

## Añadir un Endpoint Nuevo — Checklist

- [ ] Definir la ruta en `api.routes.js`
- [ ] Crear la interface en `types/api.ts` con JSDoc que apunte a la ruta:
  ```typescript
  /** POST /api/nueva-ruta */
  export interface NuevaRutaResponse {
    success: boolean;
    data: MiTipo;
  }
  ```
- [ ] Tipar el fetch en el componente o VpnContext:
  ```typescript
  const data: NuevaRutaResponse = await res.json();
  ```
- [ ] Nunca usar `as any` — si la forma es desconocida usar `unknown` y narrowing
- [ ] Tipar el body del request si es POST

## Formato de Auditoría

Cuando detectes drift, reportar como tabla:

| Ruta | Campo | Backend envía | Tipo frontend | Estado |
|------|-------|---------------|---------------|--------|
| GET /api/nodes | nodes[].cached | `boolean` | no existe | ❌ Falta en tipo |
| POST /device/antenna | stations[].hostname | `string \| null` | no existe | ❌ Falta en tipo |

Luego aplicar todos los fixes directamente.

## Patrones de Tipos

### Wrapper estándar de respuesta
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}
```

### Respuesta con fallback offline
```typescript
interface NodeInfo {
  // ...campos normales...
  cached?: boolean;    // true si viene de SQLite (MikroTik offline)
  last_seen?: number;  // timestamp Unix ms
}
```
