# 📘 Manual completo — MikroTikVPN Remote Manager (`GestionVPN-1.0`)

> **Documentación de grado replicación.** Objetivo: que cualquier persona técnica pueda **entender, operar y reconstruir** el sistema completo desde cero — panel, servidor VPN MikroTik y VPS — con todos los alcances.
> Generado: **2026-06-24** sobre `cfa8de0`. Idioma: español. Cada documento enlaza al código real (clic en `archivo:línea`).
> Para el *porqué* de cada decisión, ver [`HANDOFF.md`](../../HANDOFF.md) §4. Para diagramas, [`docs/arquitectura/`](../arquitectura/README.md).

---

## 0) Cómo está organizada esta documentación

| # | Documento | Qué responde |
|---|---|---|
| 00 | **Índice y trazabilidad** (este) | ¿Dónde está cada cosa? Glosario + matriz necesidad→función→archivo→regla→test |
| 01 | [`01_Tipos_de_Usuario.md`](./01_Tipos_de_Usuario.md) | ¿Qué roles existen, qué ve cada uno y cómo se aplican los permisos? |
| 02 | [`02_Referencia_de_Funciones.md`](./02_Referencia_de_Funciones.md) | ¿Qué hace **cada función** del backend y frontend? (función por función) |
| 03 | [`03_Config_Servidor_VPN_MikroTik.md`](./03_Config_Servidor_VPN_MikroTik.md) | ¿Cómo está configurado el **MikroTik core** (VPN, VRF, mangle, firewall)? |
| 04 | [`04_Config_VPS.md`](./04_Config_VPS.md) | ¿Cómo está configurado el **VPS** (Docker, wg0, secretos, nginx, jobs)? |
| 05 | [`05_Local_vs_VPS.md`](./05_Local_vs_VPS.md) | ¿Qué cambia **entre desarrollo local y producción**? (matriz completa) |
| 06 | [`06_Guia_Replicacion.md`](./06_Guia_Replicacion.md) | Tutorial paso a paso para **levantar todo desde cero** (local y VPS) |

> 🟢 **Local** vs 🔵 **VPS**: a lo largo de toda la documentación, estos iconos marcan lo que difiere entre el entorno de desarrollo y el de producción. La diferencia completa está consolidada en el doc 05.

---

## 1) Glosario (términos que se repiten en todo el manual)

| Término | Significado |
|---|---|
| **Core / MikroTik core** | El router central compartido (`GW-VPN-CORE-ISP`, RB750GL). Termina todos los túneles. IP pública `213.173.36.232`. |
| **CPE** | *Customer Premises Equipment*: el MikroTik/router de cada torre remota. Termina su túnel (SSTP o WG) contra el Core. |
| **Nodo (ND-N)** | Una torre dada de alta. Identificado por número (`ND2`, `ND3`…). ND1 está reservado para el Core. |
| **VRF** | *Virtual Routing and Forwarding*: tabla de rutas aislada por nodo (`VRF-ND<n>-<NOMBRE>`). Solo enruta la LAN de su torre. |
| **mangle** | Regla de firewall RouterOS `action=mark-routing` que marca tráfico **por origen** (`src-address`) hacia un VRF. |
| **Plano de gestión** | Las 3 redes WireGuard `10.x` por las que el panel/usuarios alcanzan los routers (VPS / CLIENTES / ADMIN). |
| **SSTP** | *Secure Socket Tunneling Protocol*: VPN sobre TLS (PPP). Una de las dos formas de conectar un CPE. |
| **WG / WireGuard** | La otra forma de conectar un CPE (y el transporte del plano de gestión). |
| **scan-pool** | Rango `10.11.252.0/24` de IPs de origen del escaneo, una por workspace (Opción C). |
| **scan-IP** | La IP concreta del scan-pool amarrada a un workspace; el SSH/HTTP del escaneo sale atado a ella. |
| **Workspace** | El contenedor multi-tenant: 1 moderador (OWNER) + sus members. Aísla nodos, IPs y datos. |
| **mgmt_ip** | IP de gestión amarrada a un usuario (en `user_mgmt_ips`): por ella entra su tráfico al VRF. |
| **Opción C** | La decisión de arquitectura: scan-IP por workspace para escaneo concurrente multi-VRF desde el VPS. |
| **`wg0`** | La interfaz WireGuard del VPS (config manual del SO, no la gestiona la app). |
| **Contratos** | Paquete `@gestionvpn/contracts`: tipos Zod compartidos backend↔frontend (anti-drift). |

---

## 2) Plano IP de un vistazo (fuente de verdad: `server/lib/mgmtNet.js`)

| Red | CIDR | Interfaz Core | Puerto | Para qué |
|---|---|---|---|---|
| Gestión **VPS** | `10.12.250.0/24` | `VPN-WG-VPS` | `:13232` | Peer del VPS (`.60`) — el panel controla el router |
| Gestión **CLIENTES** | `10.13.250.0/24` | `VPN-WG-CLIENTES` | `:13233` | Moderadores y members (`mgmt_ip`) |
| Gestión **ADMIN** | `10.14.250.0/24` | `VPN-WG-ADMIN` | `:13234` | Dispositivos del administrador |
| IP de nodo **WG** | `10.11.250.<ND>` | (vive en el CPE) | — | Túnel + gestión unificados del nodo WG |
| IP de nodo **SSTP** | `10.11.251.<ND>` | (PPP `remote-address`) | — | Túnel + gestión del nodo SSTP (`.1`=Core) |
| **scan-pool** | `10.11.252.0/24` | `VPN-WG-VPS` | — | scan-IP por workspace (`.2–.254`) |

> La `.1` de cada `/24` está **reservada** para el endpoint del Core → los nodos arrancan en **ND2**.
> IPs públicas: **MikroTik = `213.173.36.232`** (endpoint WG/SSTP) · **VPS = `134.199.212.232`** (panel).

---

## 3) Matriz de trazabilidad (necesidad → implementación)

> Lee así: una capacidad del producto, dónde se dispara en el frontend, qué endpoint la atiende, qué función del backend hace el trabajo, en qué archivo vive, qué regla §4 la gobierna y qué test la cubre. Las funciones se detallan en el doc 02.

| Capacidad | Frontend | Endpoint | Función núcleo (archivo) | Regla §4 | Test |
|---|---|---|---|---|---|
| **Login / sesión** | `RouterAccess` | `POST /api/auth/login` | `verifyToken` ([auth.middleware.js:31](../../server/auth.middleware.js)) · `signSession` ([lib/jwt.js:15](../../server/lib/jwt.js)) | — | `passwordReset.test.js` |
| **Setup inicial (1er admin)** | `RouterAccess` (setup) | `auth.routes` | `vpn_users` seed / first-run | — | — |
| **Invitar moderador/member** | `ModeratorsModule` / `TeamModule` | `POST /api/admin/moderators` · `/api/team/invite` | `invitationRepo` ([db/repos/invitationRepo.js](../../server/db/repos/invitationRepo.js)) | §16 | `nodesAccessControl.test.js` |
| **Aceptar invitación + WG** | `AcceptInvitationForm` | `POST /api/team/accept` | `memberWgRepo` · `wgkeys.generateKeyPair` ([lib/wgkeys.js](../../server/lib/wgkeys.js)) | — | `wgkeys.test.js` |
| **Alta de nodo (WG/SSTP)** | `NuevoNodo` | `POST /api/node/provision` | `provision.routes` ([routes/nodes/provision.routes.js:248](../../server/routes/nodes/provision.routes.js)) · `cpeScript` | §4.1/§4.2/§4.26 | `provisionAllocation.test.js` |
| **Baja de nodo** | `EliminarNodo` | `POST /api/node/deprovision` | `deprovisionNodeOnRouter` ([lib/nodeDeprovision.js:24](../../server/lib/nodeDeprovision.js)) | §4.12/§4.13/§4.20 | `nodeScopeLeak.test.js` |
| **Activar túnel (acceso)** | `NodeAccessPanel` | `POST /api/tunnel/activate` | `addUserMangle` ([lib/tunnelProvisioner.js:133](../../server/lib/tunnelProvisioner.js)) · `sessionRepo` | §4.3/§4.5/§4.17 | `mangleFilters.test.js` |
| **Escanear LAN** | `NetworkDevicesModule` | `GET /api/node/scan-stream` (SSE) | `scanMangle.setup` ([lib/scanMangle.js:22](../../server/lib/scanMangle.js)) · `resolveScanTargetVrf` ([lib/scanTarget.js:35](../../server/lib/scanTarget.js)) | §4.15/§4.28 | `scanMangle.test.js`, `scanTarget`* |
| **Monitor AP** | `ApMonitorModule` | `GET /api/ap-monitor/*` | `apPollJob` ([lib/apPollJob.js](../../server/lib/apPollJob.js)) · `scanLock` | §4.6/§4.16 | `apPollJob.test.js`, `apMonitorSecurity.test.js` |
| **AllowedIPs del `.conf`** | (descarga `.conf`/QR) | `wireguard.routes` | `mgmtAllowedIpsFor` ([lib/mgmtAllowedIps.js:30](../../server/lib/mgmtAllowedIps.js)) | §4.10 | `mgmtAllowedIps.test.js` |
| **Autosync `wg0` del VPS** | (automático al provisionar) | (efecto de provision) | `appendWg0Intent` ([lib/wg0Sync.js](../../server/lib/wg0Sync.js)) + watcher host | §4.27 | `wg0Sync.test.js` |
| **Config del router core** | `SettingsModule` (admin) | `POST /api/settings/save` | `app_settings` (`MT_IP`/`MT_USER`/`MT_PASS` cifrada) | §4.9 | `settingsAccess.test.js` |
| **Conexión al router** | (transversal) | (todas las de router) | `connectToMikrotik` ([routeros.service.js:153](../../server/routeros.service.js)) | §4.17/§4.18 | `routerosPatches.test.js` |
| **Cifrado de credenciales** | — | — | `encryptPass`/`decryptPass` (`db.service.js`) · `crypto` ([lib/crypto.js](../../server/lib/crypto.js)) | §4.8 | `crypto.test.js` |
| **Aislamiento multi-tenant** | (transversal) | (todas) | `tenantScope` ([lib/tenantScope.js](../../server/lib/tenantScope.js)) · `filterNodesForRole` | §4.3/§4.20 | `tenantScope.test.js` |
| **Asignar scan-IP** | (automático al crear ws) | (efecto de crear ws) | `scanIpRepo.allocateInTx` ([db/repos/scanIpRepo.js](../../server/db/repos/scanIpRepo.js)) · `ipAlloc.lowestFreeOctet` | §4.15 | `ipAlloc.test.js` |
| **Salud del sistema** | — | `GET /api/health` | `health.routes` (mysql+routeros+smtp) | — | `smoke.test.js` |

\* `scanTarget` se cubre indirectamente vía los tests de escaneo/aislamiento.

---

## 4) Mapa de capas (resumen — detalle en doc 02 y en el blueprint)

```
Frontend (React 19)  ──tipos──▶  @gestionvpn/contracts  ◀──  Backend (Express)
                                                                  │
   index.js (helmet→cors→json→pino→métricas→verifyToken)
        │
        ├─ routes/        (compositores feature-modular)
        ├─ lib/           (dominio + servicios: provisión, mangle, mgmtNet, crypto…)
        ├─ db/repos/      (acceso a datos por agregado)
        ├─ db/mysql.js    (pool MySQL/MariaDB)
        ├─ routeros.service.js  (única conexión al MikroTik, con deadline)
        └─ ubiquiti.service.js  (SSH + probe a antenas airOS)
```

---

## 5) Lectura recomendada según tu objetivo

- **Quiero entender quién puede hacer qué** → doc 01.
- **Quiero entender qué hace una función concreta** → doc 02 (buscá por nombre de archivo).
- **Voy a configurar/reconstruir el router** → doc 03.
- **Voy a montar el servidor (VPS)** → doc 04.
- **Estoy en local y quiero saber qué cambia en prod** → doc 05.
- **Quiero levantar TODO desde cero** → doc 06 (y vuelvo a 03/04 para el detalle).

> **Mantenimiento:** esta suite se actualiza ante cambios estructurales; los cambios de feature van al `HANDOFF_LOG.md` (skill `handoff-keeper`).
