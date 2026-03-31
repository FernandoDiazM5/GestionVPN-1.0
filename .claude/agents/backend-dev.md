---
name: backend-dev
description: usar con proactividad para desarrollo en Node.js/Express — rutas, RouterOS API, SQLite, SSH a Ubiquiti, cifrado de credenciales, y cualquier archivo dentro de server/. Activa ante cualquier modificación de device.routes.js, node.routes.js, users.routes.js, settings.routes.js, db.service.js, ubiquiti.service.js, routeros.service.js o index.js.
memory: project
skills:
  - backend-express
---

Eres un experto altamente proactivo en desarrollo backend Node.js + Express para este proyecto MikroTik VPN Manager.

Mejora continua: Revisa siempre tu memoria antes de empezar. Cada vez que corrijas un bug, implementes un nuevo endpoint o apliques un patrón correcto (cierre de api, fallback SQLite, etc.), consulta tu memoria y regístralo detalladamente para no repetir errores pasados y optimizar tu flujo de trabajo.

Antes de cualquier acción:
1. Revisa la memoria del proyecto para contexto y bugs previos.
2. Lee el archivo completo antes de modificarlo.
3. Aplica el patrón estándar RouterOS (try/catch con cierre de api en catch).
4. Mapea siempre item['.id'] → id antes de enviar al frontend.
5. Devuelve siempre { success: true/false } consistente.
6. Registra en memoria cualquier patrón nuevo o bug encontrado.

---

## Patrón: credenciales SSH para CPE detail-direct (ap.routes.js)

### Síntoma
"All configured authentication methods failed" al hacer click en "Ver detalle CPE" desde `ApMonitorModule`.

### Causa raíz
El endpoint `POST /cpes/:mac/detail-direct` usaba las credenciales enviadas por el frontend (`dev.sshUser`/`dev.sshPass`), que son las del AP en sí, NO las del nodo. Los CPEs comparten credenciales con los APs del nodo, que el usuario configura manualmente en el panel "Credenciales SSH" del nodo.

### Relación de datos
- `devices` table → `data.nodeId` === `ppp_user` del nodo (los nodos usan `ppp_user` como PK)
- `node_ssh_creds` table → `ppp_user` PK, `ssh_creds` JSON `[{user, encPass}]` (cifrado con `encryptPass`/`decryptPass`)

### Fix aplicado (ap.routes.js)
```javascript
// 1. Con apId, buscar device → nodeId
const devRow = await db.get('SELECT data FROM devices WHERE id = ?', [apId]);
const dev = JSON.parse(devRow.data);
const nodeId = dev.nodeId; // === ppp_user del nodo

// 2. Leer credenciales del nodo
const credsRow = await db.get(
    'SELECT ssh_creds, ssh_user, ssh_pass FROM node_ssh_creds WHERE ppp_user = ?', [nodeId]
);
credList = JSON.parse(credsRow.ssh_creds).map(c => ({ user: c.user, pass: decryptPass(c.encPass) }));

// 3. Probar cada credencial en orden, usar la primera que funcione
for (const cred of credList) {
    try { s = await getDetail(cpe_ip, sshPort, cred.user, cred.pass); break; }
    catch (e) { lastError = e; }
}
if (!s) throw lastError;

// Fallback: credenciales enviadas por frontend si no hay node_ssh_creds
if (credList.length === 0) credList = [{ user: user || '', pass: pass || '' }];
```

### Cuándo aplicar
Cualquier endpoint que haga SSH a un CPE o equipo de la red debe buscar las credenciales en `node_ssh_creds` usando el `nodeId` del AP padre, no confiar en las del frontend.

---

## v3.2 — Arquitectura Modular de Rutas (2026-03-28)

### Estructura de Rutas Actual
El monolito `api.routes.js` fue eliminado. Ahora existen 6 routers modulares:
```
server/routes/
  core.routes.js       — SessionVPN, secretos PPP, activar/desactivar túneles
  node.routes.js       — CRUD de nodos (SQLite + MikroTik sync)
  device.routes.js     — CRUD de APs Ubiquiti (tabla `aps`)
  wireguard.routes.js  — Peers WireGuard
  settings.routes.js   — Credenciales maestras MikroTik (AES-256-GCM)
  users.routes.js      — CRUD de usuarios del sistema (RBAC)
```

### Registro en server/index.js
```javascript
app.use('/api/auth', authRoutes);
app.use('/api', verifyToken, coreRoutes);
app.use('/api', verifyToken, nodeRoutes);
app.use('/api', verifyToken, deviceRoutes);
app.use('/api', verifyToken, wireguardRoutes);
app.use('/api', verifyToken, settingsRoutes);
app.use('/api/users', verifyToken, usersRoutes);
app.use('/api/ap-monitor', verifyToken, apRoutes);
```

### Sistema de Autenticación JWT (auth.middleware.js)
- `verifyToken` verifica JWT y además inyecta `req.mikrotik = { ip, user, pass }` con credenciales descifradas de `app_settings`
- El frontend NUNCA conoce las credenciales MikroTik maestras
- `403 Forbidden` = token inválido/expirado | `401 Unauthorized` = token ausente
- Acepta token por query string como fallback para SSE: `const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;` — `EventSource` no admite headers custom

### RBAC — users.routes.js
- Middleware interno al router: `if (req.user?.role !== 'admin') return 403`
- Fail-safes: no se puede borrar/degradar al último admin
- No se puede borrar la propia cuenta de sesión activa
- Contraseñas hasheadas con `bcryptjs` (salt: 10 rounds)

### Patrón UPSERT en tabla `aps` (device.routes.js)
```javascript
// Correcto: SQL UPSERT — nunca duplica, solo sobreescribe
await db.run(`INSERT INTO aps (...) VALUES (...)
  ON CONFLICT(id) DO UPDATE SET campo = excluded.campo`);

// El payload al servidor NUNCA debe incluir cachedStats
// deviceDb.ts extrae el esqueleto antes de enviar:
const { cachedStats, ...skeleton } = device;
await apiFetch('/api/db/devices', { body: JSON.stringify(skeleton) });
```

### Settings — Credenciales MikroTik (settings.routes.js)
```javascript
// Guardar cifrado:
await saveAppSetting('MT_PASS', encryptPass(value));
// Leer enmascarado al frontend (nunca el valor real):
{ MT_IP: '192.168.1.1', MT_USER: 'admin', MT_PASS: '••••••••' }
```

### Enmascarado de contraseñas en respuestas API
**Regla:** Nunca enviar contraseñas descifradas en endpoints de consulta general.

| Endpoint | Campo | Valor retornado |
|---|---|---|
| `POST /node/details` | `pppPassword` | `'********'` (enmascarado) |
| `POST /node/creds/get` | `pppPassword` | Valor real descifrado (endpoint exclusivo de credenciales, protegido por JWT) |
| `GET /settings/get` | `MT_PASS` | `'••••••••'` (enmascarado) |

**Importante:** `/node/creds/get` retorna `pppPassword` (no `password`). El frontend debe usar ese nombre exacto.

### writeIdempotent (routeros.service.js)
Wrapper para operaciones RouterOS que deben ser idempotentes (crear PPP secrets, interfaces, etc.):
```javascript
// Ignora errores "already exists" / "already have" — retorna [] si ya existe
const result = await writeIdempotent(api, ['/ppp/secret/add', ...params]);
```
Importar siempre desde routeros.service.js:
```javascript
const { writeIdempotent } = require('../routeros.service');
```

### `parseHandshakeSecs` — función compartida en routeros.service.js (v3.4)

**Historia:** Originalmente se definía localmente en `wireguard.routes.js` (bug v3.2: no definida → ReferenceError → 500). En v3.4 fue movida a `routeros.service.js` y exportada para que todos los módulos la compartan.

**Importar siempre desde routeros.service (NUNCA definir localmente):**
```javascript
const { parseHandshakeSecs } = require('../routeros.service');
// Usado en: wireguard.routes.js, node.routes.js
```

**Formatos RouterOS soportados:** `"1m30s"`, `"45s"`, `"2h5m"`, `""` (nunca conectado → `Infinity`).

**Regla:** `peer.active = parseHandshakeSecs(peer['last-handshake']) < 300` — activo si handshake hace menos de 5 minutos.

### Auditoría completada (2026-03-28): 38/38 issues resueltos
Todos los problemas críticos, altos, medios y bajos identificados en la auditoría están corregidos.
Correcciones incluyen: CORS restrictivo, JWT refresh, requireAdmin, PRAGMA foreign_keys, índices, transacciones, concurrencia scanner, y writeIdempotent.

---

## v3.2 — Migraciones de DB (db.service.js)

Las migraciones usan `ALTER TABLE ... ADD COLUMN` envueltas en `try/catch` ignorando `duplicate column`:
```javascript
const migrate = async (sql) => {
    try { await db.run(sql); } catch (e) {
        if (!e.message?.includes('duplicate column')) console.error('[DB]', e.message);
    }
};
// Nuevas columnas aps (Phase 4):
await migrate("ALTER TABLE aps ADD COLUMN wifi_password TEXT DEFAULT ''");
await migrate("ALTER TABLE aps ADD COLUMN cpes_conectados_count INTEGER DEFAULT 0");
await migrate("ALTER TABLE aps ADD COLUMN last_saved INTEGER DEFAULT 0");
```
**Importante:** Siempre añadir `ALTER TABLE` migrations al bloque `migrate()` en `initDb()` cuando se agreguen columnas a tablas existentes.

---

## Bugs Conocidos y Corregidos (2026-03-28)

### BUG: Worker __dirname en server/routes/
**Síntoma:** `Cannot find module 'C:\...\server\routes\scanner.worker.js'`
**Causa:** `__dirname` dentro de `routes/node.routes.js` apunta a `server/routes/`, pero `scanner.worker.js` está en `server/`.
**Fix:**
```javascript
// ❌ MAL — busca en server/routes/
const worker = new Worker(path.resolve(__dirname, 'scanner.worker.js'), { ... });
// ✅ CORRECTO — sube un nivel a server/
const worker = new Worker(path.resolve(__dirname, '..', 'scanner.worker.js'), { ... });
```
**Regla:** Cualquier `require()` o `new Worker()` dentro de `routes/*.js` que apunte a un archivo en `server/` debe usar `path.resolve(__dirname, '..')`.

### Patrón: Guard `!req.mikrotik` → 503 (no 500)
Cuando las credenciales MikroTik no están configuradas, devolver **503 Service Unavailable** con `needsConfig: true`:
```javascript
if (!req.mikrotik) return res.status(503).json({
    success: false,
    needsConfig: true,
    message: 'Configura las credenciales MikroTik en Ajustes antes de continuar.'
});
```
**Razón:** `500` es un error real del servidor; `503` indica "servicio no disponible por falta de configuración". El frontend detecta `needsConfig` y muestra un banner ambar en vez de loguear errores rojos en console.

---

## SSE — Notificación en tiempo real de cambios de túnel (core.routes.js)

### Implementación
```javascript
// En core.routes.js — patrón SSE
const sseClients = new Set();
function broadcastTunnelEvent(activeNodeVrf, tunnelExpiry) {
    const payload = JSON.stringify({ activeNodeVrf: activeNodeVrf || null, tunnelExpiry: tunnelExpiry || null });
    for (const client of sseClients) {
        try { client.write(`data: ${payload}\n\n`); } catch (_) { sseClients.delete(client); }
    }
}
// GET /api/tunnel/events
router.get('/tunnel/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.add(res);
    const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 25_000);
    req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
});
```

- `tunnel/activate` → `broadcastTunnelEvent(targetVRF, expiry)` tras guardar en SQLite
- `tunnel/deactivate` → `broadcastTunnelEvent(null, null)` tras limpiar SQLite

### auth.middleware.js — token en query string para SSE
```javascript
const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
```
`EventSource` del browser no admite headers personalizados → token va en `?token=`.

### Estado del túnel: SQLite como fuente de verdad
| Clave `app_settings` | Descripción |
|---|---|
| `active_vrf` | Nombre del VRF activo (vacío si sin túnel) |
| `tunnel_ip` | IP del túnel PPP activo (ej: `10.10.0.5`) |
| `tunnel_expiry` | Timestamp Unix ms de expiración |

`GET /tunnel/status` lee, auto-limpia si expiró (limpia las tres claves), retorna `{ activeNodeVrf, tunnelExpiry }`.

**Regla**: toda operación que cambie el estado del túnel DEBE llamar `broadcastTunnelEvent()` + `setAppSetting()` para las tres claves.

---

## Patrón cleanTunnelRules — Filtrar siempre por tunnelIP (2026-03-28)

### Problema resuelto
`cleanTunnelRules(api)` sin argumentos borraba TODAS las entradas de `vpn-activa` y mangle `WEB-ACCESS`, incluyendo entradas permanentes o de otros usuarios que no pertenecen a la sesión actual.

### Firma correcta
```javascript
// routeros.service.js
async function cleanTunnelRules(api, tunnelIP)
// tunnelIP: string IP como "10.10.0.5" — SIEMPRE pasar en producción
// null/undefined → comportamiento legacy que borra todo (evitar)
```

Filtra por:
- `address-list`: `list === 'vpn-activa' && address === tunnelIP`
- `mangle`: `comment === 'WEB-ACCESS' && src-address === tunnelIP`

### Patrón tunnel/activate — idempotente (no borrar-y-recrear) — v3.3

**BUG CRITICO CORREGIDO (2026-03-28):** La limpieza de stale mangles estaba DENTRO del bloque
`if (!alreadyHasMangle)`. Si el mangle exacto (tunnelIP+VRF) ya existía, `alreadyHasMangle` era
`true` y el bloque se saltaba completo → mangles de sesiones anteriores con otros VRFs nunca
eran limpiados. Resultado: dos reglas WEB-ACCESS con mismo src-address pero VRF distinto.

**Fix:** La limpieza de stale mangles (VRF diferente) va SIEMPRE, ANTES del check de idempotencia.

```javascript
// 1. Leer estado actual en una sola conexión
const [addrsResult, mangleResult] = await Promise.allSettled([...print]);

// 2. Agregar vpn-activa solo si tunnelIP no existe ya
const alreadyInList = allAddrs.some(a => a.list === 'vpn-activa' && a.address === tunnelIP);
if (!alreadyInList) await writeIdempotent(api, ['/ip/firewall/address-list/add', ...]);

// 3. SIEMPRE limpiar mangles de esta IP que apunten a un VRF diferente (cambio de sesión)
//    NOTA: el filtro excluye targetVRF para no borrar el mangle correcto
const staleIds = allMangle
    .filter(m =>
        m.comment === 'WEB-ACCESS' &&
        m['src-address'] === tunnelIP &&
        m['new-routing-mark'] !== targetVRF &&  // <-- crítico: solo VRFs distintos
        m['.id']
    )
    .map(m => m['.id']);
for (const staleId of staleIds) {
    await safeWrite(api, ['/ip/firewall/mangle/remove', `=.id=${staleId}`]);
}

// 4. Agregar mangle solo si la combinación exacta tunnelIP+targetVRF no existe ya
const alreadyHasMangle = allMangle.some(m =>
    m.comment === 'WEB-ACCESS' && m['src-address'] === tunnelIP && m['new-routing-mark'] === targetVRF
);
if (!alreadyHasMangle) {
    await writeIdempotent(api, ['/ip/firewall/mangle/add', ...]);
}

// 5. Guardar tunnel_ip en app_settings (junto con active_vrf y tunnel_expiry)
await setAppSetting('tunnel_ip', tunnelIP);
```

**Regla:** Stale cleanup siempre FUERA e ANTES del check de idempotencia. Nunca anidar limpieza de
mangles dentro de un `if (!alreadyHasMangle)`.

### Patrón tunnel/deactivate — leer tunnelIP de SQLite
```javascript
// NO depender del frontend para saber qué IP limpiar
const savedTunnelIP = await getAppSetting('tunnel_ip');
const tunnelIP = savedTunnelIP || req.body?.tunnelIP || null;

if (tunnelIP) {
    await cleanTunnelRules(api, tunnelIP); // solo borra entradas de esta IP
} else {
    // Fallback (sesión antigua sin tunnel_ip en SQLite): limpieza por comment
    // cleanTunnelRules(api, null) → elimina TODOS los WEB-ACCESS y vpn-activa
    await cleanTunnelRules(api, null);
}
// Siempre limpiar SQLite aunque no haya tunnelIP
await setAppSetting('active_vrf', '');
await setAppSetting('tunnel_ip', '');
await setAppSetting('tunnel_expiry', '');
```

---

## Orden correcto de POST /node/deprovision (node.routes.js) — v3.3

### Cambio aplicado (2026-03-28)
El endpoint fue corregido para seguir el orden arquitectural real del MikroTik y NO borrar `LIST-NET-REMOTE-TOWERS`.

### Pasos correctos

| Paso | Objeto | Condicion |
|------|--------|-----------|
| 1 | Mangle `WEB-ACCESS` del VRF | Solo si `hasVrf` |
| 2 | Member `LIST-VPN-TOWERS` | Solo si `hasVrf` |
| 3 | PPP Secret | Siempre |
| 4 | SSTP Interface | Solo si `hasVrf` |
| 5 | VRF | Solo si `hasVrf` |
| 6 | Rutas del VRF (LAN + retorno MGMT `192.168.21.0/24`) | Solo si `hasVrf` |
| 7 | SQLite cascade `deleteNode(pppUser)` | Siempre |

### Reglas clave
- `LIST-NET-REMOTE-TOWERS` nunca se toca en deprovision — las subredes LAN pueden estar compartidas entre múltiples nodos
- `vpn-activa` no se toca en deprovision — lo maneja `cleanTunnelRules` en `tunnel/deactivate`
- Las rutas VRF se eliminan DESPUES de eliminar el VRF (paso 7 tras paso 6) para evitar dependencias
- Si `vrfName` está vacío (`!hasVrf`), solo se ejecutan los pasos 3 y 8

### Pasos correctos — WireGuard (v3.4)

Detección: `pppUser.startsWith('VPN-WG-')` → flujo WG (no hay PPP secret).

| Paso | Objeto | Condicion |
|------|--------|-----------|
| 1 | Mangle `WEB-ACCESS` del VRF | Solo si `hasVrf` |
| 2 | Member `LIST-VPN-TOWERS` | Solo si `hasVrf` |
| 3 | WG Peers de la interface (`/interface/wireguard/peers/remove`) | Siempre |
| 4 | IP addresses de la interface WG (`/ip/address/remove`) | Siempre |
| 5 | Interface WG (`/interface/wireguard/remove`) | Siempre |
| 6 | VRF | Solo si `hasVrf` |
| 7 | Rutas VRF (LAN + retorno MGMT) | Solo si `hasVrf` |
| 8 | SQLite cascade `deleteNode(pppUser)` | Siempre |

### Body del request
```javascript
// lanSubnets ya NO es necesario en el body — se eliminó el paso 5
{ vrfName, pppUser }
```

---

## POST /tunnel/repair — reparación idempotente de nodo VPN (core.routes.js) — v3.3

### Qué hace
Verifica y reconstruye en una sola llamada los 7 objetos RouterOS de un nodo VPN. Idempotente: si el objeto ya existe, lo reporta como `ok` sin tocarlo.

### Body
```javascript
{ pppUser, vrfName, lanSubnets: string[], tunnelIP?: string, adminWgNet?: string }
```
- `ifaceName` se deriva en el servidor: `vrfName.replace(/^VRF-/, 'VPN-SSTP-')`
- `adminWgNet` default: `'192.168.21.0/24'`

### 7 pasos y condiciones

| Paso | Objeto RouterOS | Condicional |
|------|----------------|-------------|
| 1 | SSTP Interface (`/interface/sstp-server/add`) | Siempre |
| 2 | LIST-VPN-TOWERS member | Siempre |
| 3 | VRF (crea o agrega interfaz faltante con `/ip/vrf/set`) | Siempre |
| 4 | Rutas LAN por subred + ruta MGMT → VPN-WG-MGMT | Siempre |
| 5 | LIST-NET-REMOTE-TOWERS por subred | Siempre |
| 6 | vpn-activa entry | Solo si `tunnelIP` presente |
| 7 | Mangle WEB-ACCESS | Solo si `tunnelIP` y `vrfName` presentes |

### Patrón de lectura
```javascript
// Una conexión → 6 reads en paralelo antes de escribir nada
const [sstpResult, ifaceListResult, vrfResult, routesResult, addressListResult, mangleResult]
    = await Promise.allSettled([...6 prints...]);
// Cada resultado con fallback [] si falló el print
```

### Respuesta
```json
{ "success": true, "steps": [{ "step": 1, "obj": "SSTP Interface", "name": "VPN-SSTP-...", "status": "ok|created|error|skipped", "action": "exists|created|<error msg>|no tunnelIP" }], "repaired": 3 }
```

### Regla VRF existente sin interfaz
No se recrea el VRF — se lee `existingVrf.interfaces`, se añade `ifaceName` y se aplica `/ip/vrf/set`. Esto preserva las `interfaces` que ya tiene el VRF.

### Cuándo usar
Cuando un nodo está en SQLite pero MikroTik perdió su configuración (reboot, migración, error parcial de provisión). No reemplaza a `/node/provision` para nodos nuevos — este endpoint asume que el PPP secret ya existe.

---

## v3.4 — Soporte Dual de Protocolos: SSTP + WireGuard (2026-03-29)

### Arquitectura de identificadores de nodo

| Protocolo | `ppp_user` en SQLite | `ifaceName` en RouterOS |
|---|---|---|
| SSTP | nombre del PPP secret (ej: `ND3-TORREVIRGINIA`) | `VPN-SSTP-ND3-TORREVIRGINIA` (derivado del VRF) |
| WireGuard | nombre de la interface WG (ej: `VPN-WG-ND3-TORREVIRGINIA`) | mismo que `ppp_user` |

**Regla de detección de protocolo:**
```javascript
const isWireGuard = pppUser.startsWith('VPN-WG-') || protocol === 'wireguard';
```

### Pool de IPs por protocolo

| Protocolo | Pool IP túnel | Puerto |
|---|---|---|
| SSTP | `10.10.250.x` (PPP remote-address) | 443/TCP |
| WireGuard | `10.10.251.x` (wgPeerIP) | `51820 + nodeNumber` (configurable via `wgListenPort`) |

La IP del servidor en la interface WG es siempre `10.10.251.1/32` con `network=<wgPeerIP>`.

### `parseHandshakeSecs` — función compartida (routeros.service.js)

La función fue movida desde `wireguard.routes.js` a `routeros.service.js` y exportada.
Todos los archivos que la necesiten deben importarla desde ahí:
```javascript
const { parseHandshakeSecs } = require('../routeros.service');
// wireguard.routes.js y node.routes.js ya la importan así
```

### POST /nodes — Combinación SSTP + WG

Lee en paralelo 7 fuentes: `ppp/secret`, `interface/wireguard`, `interface/wireguard/peers`, `ip/vrf`, `ppp/active`, `interface/sstp-server`, `ip/route`.

- SSTP nodes: filtrar secrets con `service === 'sstp'`
- WG nodes: filtrar interfaces WG con patrón `/^VPN-WG-ND\d+/i` (excluye `VPN-WG-MGMT`)
- Nodo WG activo si `parseHandshakeSecs(last-handshake) < 300`
- `ppp_user` de un nodo WG = nombre de la interface WG

### POST /node/provision — WireGuard

Campos extra en el body: `protocol='wireguard'`, `cpePublicKey`, `wgListenPort` (opcional).
Si `wgListenPort` no viene, se calcula: `51820 + nodeNumber`.

Pasos WG:
1. Crear interface WG (`VPN-WG-NDx-NOMBRE`)
2. Leer `public-key` del servidor (print inmediato post-create)
3. Agregar IP `10.10.251.1/32` con `network=<wgPeerIP>`
4. Agregar peer con `allowed-address=<wgPeerIP>/32,<lanSubnets>`
5. Resto igual que SSTP: LIST-VPN-TOWERS, LIST-NET-REMOTE-TOWERS, VRF, rutas LAN, ruta MGMT

Respuesta incluye: `serverPublicKey`, `peerIP` (`10.10.251.x`), `listenPort`.

### POST /node/deprovision — WireGuard

Flujo WG (pasos 3-5, antes del VRF):
1. Mangle WEB-ACCESS (si hasVrf) — igual que SSTP
2. LIST-VPN-TOWERS member (si hasVrf) — igual que SSTP
3. Eliminar WG peers asociados a la interface (`/interface/wireguard/peers/remove`)
4. Eliminar IP addresses de la interface WG (`/ip/address/remove`)
5. Eliminar la interface WG (`/interface/wireguard/remove`)
6. VRF (si hasVrf) — igual que SSTP
7. Rutas VRF (si hasVrf) — igual que SSTP
8. SQLite cascade `deleteNode(pppUser)` — igual

**NOTA:** Para SSTP el `pppUser` es el nombre del secret. Para WG es el nombre de la interface. NO se intenta buscar PPP secret para nodos WG.

### POST /tunnel/repair — Detección protocolo

Ahora lee también `/interface/wireguard/print` en el bloque paralelo inicial (7 reads total).
El Paso 1 crea la interface correcta según protocolo detectado:
- `isWG = pppUser.startsWith('VPN-WG-')` → create `/interface/wireguard/add`
- else → create `/interface/sstp-server/add`

El puerto WG en repair se calcula: `51820 + parseInt(ndMatch[1])` desde el nombre de la interface.
