# Skill: Cascade Delete de Nodos VPN

## Trigger
Usar cuando el usuario elimina un nodo VPN (deprovision), o reporta que datos persisten después de eliminar un nodo.

## Estado: CORREGIDO (2026-03-28)

### Bug original
`deleteNode()` buscaba APs en tabla `devices` (deprecada) usando `ppp_user` como `nodeId`. Pero:
- Los APs se guardan en tabla `aps` (normalizada, v3.2)
- `aps.nodo_id` = MikroTik `.id` (ej: `*17`), NO `ppp_user`
- `nodes.id` = `ppp_user`, pero `nodes.data.id` = MikroTik `.id`

### Fix implementado

**`server/db.service.js` — `deleteNode(pppUser)`:**
1. Lee `nodes.data` → extrae MikroTik `.id`
2. Busca en tabla `aps` por `nodo_id IN (pppUser, mikrotikId)`
3. Busca en tabla `devices` legacy (fallback) con `JSON_VALID` guard
4. Cascade delete: `aps` + `devices` + `cpes_conocidos` + `historial_senal`
5. Retorna `{ devicesDeleted, deviceIds }` al frontend

**`server/routes/device.routes.js` — `cleanup-orphan-devices`:**
1. Lee `nodes.data` de cada nodo → extrae MikroTik `.id` → Set de IDs válidos
2. Busca APs en tabla `aps` cuyo `nodo_id` no está en el Set
3. Cascade delete: `aps` + `cpes_conocidos`

**Frontend (`NodeAccessPanel.tsx` — `onSuccess`):**
1. `removeNodeFromState(pppUser)` — limpia VpnContext
2. `deviceDb.cleanupOrphans()` — limpia SQLite
3. `deviceDb.removeByIds(deletedDeviceIds)` — limpia por IDs explícitos
4. `cpeCache.clear()` — limpia IndexedDB topology_cpes

## Relación de IDs
| Entidad | Campo | Ejemplo | Dónde |
|---------|-------|---------|-------|
| NodeInfo.id | MikroTik `.id` | `*17` | Frontend, nodes.data |
| NodeInfo.ppp_user | PPP secret name | `TorreHousenet` | Frontend, nodes.id (PK) |
| SavedDevice.nodeId | MikroTik `.id` | `*17` | Frontend, aps.nodo_id |
| nodes.id (SQLite) | ppp_user | `TorreHousenet` | Backend PK |

## Capas de persistencia (todas limpiadas)
1. SQLite `aps` + `devices` → `deleteNode()` cascade
2. SQLite `cpes_conocidos` + `historial_senal` → cascade por ap_id
3. SQLite `node_*` (6 tablas) → cascade por ppp_user
4. IndexedDB `vpn_store` → `removeNodeFromState()` → auto-save (debounce 500ms)
5. IndexedDB `topology_cpes` → `cpeCache.clear()`
6. IndexedDB `antenna_stats_cache` → `statsCache.remove()` via `deviceDb.removeByIds()`
7. React state → `nodes.length` decrease triggers reload in ApMonitorModule + NetworkDevicesModule

## Bug encadenado corregido (2026-03-28)
Al enmascarar `pppPassword` en `/node/details` (fix B2), se descubrió que `NodeAccessPanel.tsx` tenía un bug de nombre de campo (`creds?.password` en vez de `creds?.pppPassword`). Esto causaba que la contraseña de DB nunca se cargara, y el fallback de MikroTik guardaba `'********'` como contraseña real.
Fix: campo corregido + guard contra valores enmascarados.

## Componentes eliminados
- `ControlPanel.tsx` — Panel original de túneles, reemplazado por NodeAccessPanel.tsx. Eliminado como código muerto.
