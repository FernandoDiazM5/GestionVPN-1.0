---
name: backend-express
description: Use this skill whenever the user is working on the Node.js backend of this project. Trigger for: adding or editing Express routes, working with RouterOS API, modifying db.service.js, fixing backend errors, working with SQLite, PPP secrets/actives, VRF management, tunnel activation/deactivation, SSH to Ubiquiti, ubiquiti.service.js, CORS config, or any file inside server/. Also trigger when the user mentions api.routes.js, db.service.js, ubiquiti.service.js, routeros.service.js, or asks how the backend handles a specific operation.
---

# Backend — Node.js + Express

Plain JavaScript (no TypeScript). Leer el archivo antes de modificar.

## Stack

| Tool | Uso |
|------|-----|
| Express | HTTP en `:3001` |
| `sqlite` + `sqlite3` | BD async |
| RouterOS API | MikroTik port `8728` |
| `ssh2` | SSH a Ubiquiti airOS |
| `crypto` (built-in) | AES-256-GCM para credenciales |

## Estructura

```
server/
├── index.js              — Express, CORS, monta /api
├── api.routes.js         — Todas las rutas HTTP
├── routeros.service.js   — connectToMikrotik, safeWrite, getErrorMessage
├── ubiquiti.service.js   — SSH, parseo airOS, escaneo red
└── db.service.js         — SQLite helpers
```

## Rutas

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/connect` | Prueba conexión RouterOS |
| POST | `/diagnose` | Prueba puertos 8728/8729 + auth |
| POST | `/secrets` | Lista PPP secrets (SSTP) |
| POST | `/active` | Sesiones PPP activas |
| POST | `/nodes` | Nodos SSTP + VRF + caché SQLite |
| POST | `/interface/activate` | Activa interface SSTP-server |
| POST | `/interface/deactivate` | Deshabilita interface SSTP-server |
| POST | `/tunnel/activate` | Abre acceso VRF (mangle + address-list) |
| POST | `/tunnel/deactivate` | Revoca acceso VRF |
| POST | `/tunnel/keepalive` | Restaura reglas si faltan (heartbeat) |
| POST | `/device/scan` | Escanea subnet buscando Ubiquiti |
| POST | `/device/antenna` | SSH a antena → `AntennaStats` |

## RouterOS API — Patrón Estándar

```js
let api;
try {
  api = await connectToMikrotik(ip, user, pass);
  const result = await safeWrite(api, ['/ppp/secret/print']);
  await api.close();
  res.json(result);
} catch (error) {
  if (api) try { await api.close(); } catch (_) {}
  res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
}
```

**Regla**: siempre cerrar `api` en el catch. Una sesión abierta bloquea la siguiente.

### Campo `.id` de RouterOS
```js
// ✅ Correcto
const id = item['.id'];

// ❌ Incorrecto — undefined
const id = item.id;
```
El backend DEBE mapear `.id` → `id` antes de enviar al frontend.

### Comandos RouterOS comunes
```js
await safeWrite(api, ['/ppp/secret/print']);
await safeWrite(api, ['/ppp/active/print']);
await safeWrite(api, ['/ip/vrf/print']);
await safeWrite(api, ['/interface/sstp-server/print']);
await safeWrite(api, ['/ppp/secret/set', `=.id=${id}`, '=comment=label']);
await safeWrite(api, ['/interface/sstp-server/enable', `=.id=${id}`]);
```

## SQLite — Esquema

```sql
devices (id TEXT PRIMARY KEY, data TEXT)         -- Ubiquiti (JSON completo)
nodes (id TEXT PRIMARY KEY, data TEXT)           -- Nodos SSTP cacheados
node_creds (ppp_user TEXT PRIMARY KEY, ppp_password TEXT)  -- cifradas AES-256-GCM
node_labels (ppp_user TEXT PRIMARY KEY, label TEXT)        -- etiquetas personalizadas
ap_nodos (id, nombre, descripcion, ubicacion, creado_en)
aps (id, nodo_id, hostname, modelo, firmware, mac_lan, mac_wlan, ip,
     frecuencia_ghz, ssid, canal_mhz, tx_power, modo_red,
     usuario_ssh, clave_ssh, puerto_ssh, activo, registrado_en)
cpes_conocidos (mac TEXT PRIMARY KEY, ap_id TEXT, ...)
```

### Uso de helpers
```js
const { getDb, saveNode, getNodes, encryptPass, decryptPass } = require('./db.service');

const db = await getDb();
const rows = await db.all('SELECT * FROM node_labels');
await saveNode({ ppp_user, nombre_nodo, nombre_vrf, segmento_lan, ip_tunnel, last_seen });
const cifrado = encryptPass('mi_contraseña');
```

**Importante**: el wrapper `sqlite` es async — siempre `await`.

## Patrón Fallback SQLite

Cuando RouterOS no responde, `/api/nodes` sirve desde caché:
```js
} catch (error) {
  const cached = await getNodes();
  if (cached.length > 0) {
    return res.json(cached.map(n => ({ ...n, running: false, cached: true })));
  }
  res.status(500).json({ success: false, message: getErrorMessage(error, ip, user) });
}
```
El flag `cached: true` le indica al frontend mostrar estado offline.

## Checklist — Nueva Ruta

- [ ] Validar inputs: `if (!ip) return res.status(400).json({...})`
- [ ] `try/catch` con cierre de `api` en el catch
- [ ] Devolver `{ success: true/false }` consistentemente
- [ ] Agregar tipo en `vpn-manager/src/types/api.ts`
- [ ] No hardcodear credenciales

## Variables de Entorno

```
DATA_DIR=.      # dev; en Docker: /data
PORT=3001
NODE_ENV=production
```
