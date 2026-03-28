# SQLite Database Admin Agent

Agent especializado en la gestión de la base de datos SQLite del proyecto MikroTik VPN Manager.

## Responsabilidades
- Cascade delete de nodos VPN y todas las entidades relacionadas
- Integridad referencial entre tablas (nodes, devices, cpes_conocidos, historial_senal)
- Operaciones CRUD sobre devices, nodes, y tablas auxiliares
- Limpieza de registros huérfanos
- Encriptación/desencriptación de credenciales (AES-256-GCM)

## Esquema de tablas

### Sistema VPN (clave: ppp_user)
| Tabla | PK | Descripción |
|---|---|---|
| `nodes` | `id` = ppp_user | Cache de nodos SSTP |
| `node_labels` | `ppp_user` | Etiquetas personalizadas |
| `node_creds` | `ppp_user` | Credenciales PPP cifradas |
| `node_tags` | `ppp_user` | Tags libres |
| `node_history` | `id` (auto) | Historial de eventos (FK: ppp_user) |
| `node_ssh_creds` | `ppp_user` | Credenciales SSH del nodo |

### Sistema Devices/APs (clave: device.id = MAC sin separadores)
| Tabla | PK | Descripción |
|---|---|---|
| `devices` | `id` | APs Ubiquiti guardados (JSON en campo `data`) |
| `cpes_conocidos` | `mac` | CPEs descubiertos (FK: ap_id → devices.id) |
| `historial_senal` | `id` (auto) | Historial de señal (FK: ap_id → devices.id) |

### Sistema AP Legacy
| Tabla | PK | Descripción |
|---|---|---|
| `ap_nodos` | `id` | Agrupador de APs (sistema legacy) |
| `aps` | `id` | APs registrados (FK: nodo_id → ap_nodos.id) |

### Otras
| Tabla | PK | Descripción |
|---|---|---|
| `peer_colors` | `peer_address` | Colores de peers WireGuard |
| `app_settings` | `key` | Configuración global |

## Relación crítica: node.id vs nodeId en devices

**BUG CONOCIDO (corregido 2026-03-27):**
- `NodeInfo.id` = MikroTik `.id` (ej: `*17`, `*19`) — viene de `/ppp/secret/print`
- `NodeInfo.ppp_user` = nombre del PPP secret (ej: `ppp-pass-torreagapito`)
- `SavedDevice.nodeId` = `node.id` (el `.id` de MikroTik, NO el ppp_user)
- `nodes` SQLite table: `id = ppp_user` (NO el `.id` de MikroTik)

Esto significa que `JSON_EXTRACT(data, '$.nodeId')` almacena el `.id` de MikroTik (ej: `*17`),
pero la tabla `nodes` usa `ppp_user` como PK. Son valores DISTINTOS.

**Patrón correcto para cascade delete (implementado):**
1. `deleteNode(pppUser)`: Lee `nodes.data` → extrae MikroTik `.id` → busca devices por ese `.id`
2. `cleanup-orphan-devices`: Lee `nodes.data` de cada nodo → construye Set de MikroTik `.id` → compara devices

## Funciones clave en db.service.js
- `encryptDevice(device)` — AES-256-GCM sobre sshPass → campo `_enc`
- `decryptDevice(device)` — Inverso, retorna device con sshPass plano
- `encryptPass(text)` / `decryptPass(text)` — Cifrado general
- `saveNode(pppUser, nodeData)` — UPSERT en tabla nodes
- `deleteNode(pppUser)` — CASCADE DELETE de nodo + devices + CPEs + historial
- `getNodes()` — Lista todos los nodos

## Endpoints de DB en api.routes.js
- `GET /api/db/devices` — Lista todos (descifrados)
- `POST /api/db/devices` — Guarda uno (cifra antes)
- `PUT /api/db/devices/:id` — Actualiza (merge + cifra)
- `DELETE /api/db/devices/:id` — Elimina uno
- `POST /api/db/cleanup-orphan-devices` — Elimina devices huérfanos

## Capas de persistencia frontend
1. **SQLite** (`server/database.sqlite`) — devices, nodes, cpes_conocidos, historial_senal
2. **IndexedDB via localforage** (`vpn_store`) — VpnContext state (nodes, credentials, tunnelExpiry)
3. **IndexedDB via localforage** (`topology_cpes`) — cpeCache (cache de CPEs para topología)
4. **React state** — cada componente tiene su propio state de devices (NO compartido)

**Al eliminar un nodo, TODAS las capas deben limpiarse:**
1. SQLite → `deleteNode()` + cascade
2. IndexedDB vpn_store → `removeNodeFromState()` → auto-save por useEffect
3. IndexedDB topology_cpes → `cpeCache.clear()` o limpieza selectiva
4. React state → `removeNodeFromState()` actualiza nodes; components deben recargar devices
