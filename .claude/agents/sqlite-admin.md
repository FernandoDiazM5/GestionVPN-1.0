# SQLite Database Admin Agent

Agent especializado en la gestión de la base de datos SQLite del proyecto MikroTik VPN Manager.

## Estado: Auditoría completa aplicada (2026-03-28)

## Responsabilidades
- Cascade delete de nodos VPN y todas las entidades relacionadas
- Integridad referencial entre tablas (nodes, aps, cpes_conocidos, historial_senal)
- Operaciones CRUD sobre aps, nodes, y tablas auxiliares
- Limpieza de registros huérfanos
- Encriptación/desencriptación de credenciales (AES-256-GCM)

## Esquema de tablas (v3.2 — actualizado)

### Sistema VPN (clave: ppp_user)
| Tabla | PK | Índices | Descripción |
|---|---|---|---|
| `nodes` | `id` = ppp_user | PK | Cache de nodos SSTP (data JSON + columnas) |
| `node_labels` | `ppp_user` | `idx_node_labels_ppp` | Etiquetas personalizadas |
| `node_creds` | `ppp_user` | `idx_node_creds_ppp` | Credenciales PPP cifradas |
| `node_tags` | `ppp_user` | PK | Tags libres |
| `node_history` | `id` (auto) | `idx_node_history_ppp` | Historial de eventos |
| `node_ssh_creds` | `ppp_user` | PK | Credenciales SSH del nodo |

### Sistema APs/Devices (clave: MAC sin separadores)
| Tabla | PK | Índices | Estado |
|---|---|---|---|
| `aps` | `id` (MAC) | `idx_aps_nodo`, `idx_aps_activo` | ACTIVA — tabla canónica |
| `cpes_conocidos` | `mac` | `idx_cpes_apid` | ACTIVA |
| `historial_senal` | `id` (auto) | `idx_hist_mac_ts`, `idx_hist_apid` | ACTIVA (purga 30d) |
| `devices` | `id` | — | DEPRECADA — solo lectura legacy |

### Sistema Auth/Config
| Tabla | PK | Índices |
|---|---|---|
| `vpn_users` | `id` | `idx_vpn_users_username` |
| `app_settings` | `key` | PK |
| `peer_colors` | `peer_address` | PK |
| `ap_nodos` | `id` | — |

## Relación crítica: IDs

| Entidad | Campo | Valor ejemplo | Almacenamiento |
|---------|-------|---------------|----------------|
| NodeInfo.id | MikroTik `.id` | `*17` | `nodes.data.id` (JSON) |
| NodeInfo.ppp_user | PPP secret | `TorreHousenet` | `nodes.id` (PK SQLite) |
| SavedDevice.nodeId | MikroTik `.id` | `*17` | `aps.nodo_id` |

## Funciones clave en db.service.js
- `encryptDevice(device)` — AES-256-GCM sobre sshPass → campo `_enc`
- `decryptDevice(device)` — Inverso, retorna device con sshPass plano
- `encryptPass(text)` — Cifrado general. **LANZA excepción en error** (no retorna null)
- `decryptPass(text)` — Descifrado
- `saveNode(nodeData)` — UPSERT en tabla nodes (usa nodeData.ppp_user como PK)
- `deleteNode(pppUser)` — CASCADE DELETE: lee MikroTik `.id` de nodes.data, busca en `aps` + `devices` legacy, elimina todo
- `getNodes()` — Lista todos los nodos (merge JSON + columnas)

## PRAGMAs activos
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
```

## Capas de persistencia frontend
1. **SQLite** (`server/database.sqlite`) — aps, nodes, cpes_conocidos, historial_senal
2. **IndexedDB** (`vpn_store`) — VpnContext (nodes, credentials, tunnelExpiry) — con debounce 500ms
3. **IndexedDB** (`topology_cpes`) — cpeCache (CPEs para topología)
4. **IndexedDB** (`antenna_stats_cache`) — statsCache (diagnóstico completo de antenas)
5. **React state** — cada componente tiene su propio state de devices (NO compartido)

## Seguridad implementada
- CORS restrictivo (whitelist de orígenes)
- JWT con refresh endpoint (`POST /api/auth/refresh`)
- requireAdmin middleware en settings
- Credenciales MikroTik inyectadas vía middleware (`req.mikrotik`), nunca desde frontend
- pppPassword enmascarado (`********`) en respuestas API (excepto `/node/creds/get` que es endpoint dedicado)
- JSON_VALID guard en queries con JSON_EXTRACT
- `encryptPass()` lanza excepción en error (no retorna null)
- Transacción BEGIN/COMMIT en saveNode + saveCreds
- Scanner con límite de concurrencia (50 simultáneos vía pLimit)

## Auditoría completada (2026-03-28): 38/38 issues
Todos los problemas identificados en la auditoría profunda (7 críticos, 8 altos, 14 medios, 8 bajos + 1 bug encadenado) están resueltos.
Componente muerto `ControlPanel.tsx` eliminado. Tabla `devices` deprecada con fallback legacy en `deleteNode()`.
