---
name: backend-dev
description: usar con proactividad para desarrollo en Node.js/Express — rutas, RouterOS API, SQLite, SSH a Ubiquiti, cifrado de credenciales, y cualquier archivo dentro de server/. Activa ante cualquier modificación de api.routes.js, db.service.js, ubiquiti.service.js, routeros.service.js o index.js.
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
