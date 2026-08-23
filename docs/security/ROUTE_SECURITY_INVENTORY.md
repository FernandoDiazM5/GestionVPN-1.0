# Inventario de seguridad de rutas API

> Archivo generado por `server/tools/security-route-inventory.js`. No editar manualmente.

Este inventario es una línea base estática para priorizar el hardening. No sustituye pruebas de integración ni una revisión manual de autorización por recurso.

## Resumen

- Rutas detectadas: 164
- Rutas de mutación (POST/PUT/PATCH): 105
- Rutas que consumen `req.body`: 84
- Rutas con esquema de `req.body` detectable: 84/84
- Endpoints públicos de identidad sin rate limiting detectable: 0

## Alertas detectadas

- `PUBLIC_MUTATION_REVIEW`: 3

## Criterios

- **Autenticación:** middleware en la propia ruta o montaje global protegido declarado en el servidor.
- **Rate limiting:** guardas `rl.guard`, `rl.guardOtpSend`, `rl.guardPolicy` o un limiter explícito.
- **Schema body:** middleware `validate({ body })` o parseo Zod directo detectable.
- **Sinks:** uso estático detectable de SQL, procesos, filesystem, correo o administración de red.
- Las alertas `*_SCHEMA_MISSING` también pueden señalar validaciones indirectas; deben revisarse antes de corregir.
- `PUBLIC_MUTATION_REVIEW` exige confirmar que la exposición anónima sea intencional y segura.

## Rutas

| Archivo | Línea | Método | Ruta | Auth | Rol | Rate limit | Schema body | Sinks | Alertas |
|---|---:|---|---|---|---|---|---|---|---|
| `ap.routes.js` | 84 | GET | `/nodos` | sí | — | no | n/a | sql | — |
| `ap.routes.js` | 103 | POST | `/nodos` | sí | — | no | sí | sql | — |
| `ap.routes.js` | 116 | PUT | `/nodos/:id` | sí | — | no | sí | sql | — |
| `ap.routes.js` | 128 | DELETE | `/nodos/:id` | sí | — | no | n/a | sql | — |
| `ap.routes.js` | 152 | GET | `/nodos/:nodeId/aps` | sí | — | no | n/a | sql, network-admin | — |
| `ap.routes.js` | 165 | POST | `/aps` | sí | — | no | sí | sql, network-admin | — |
| `ap.routes.js` | 218 | PUT | `/aps/:id` | sí | — | no | sí | sql | — |
| `ap.routes.js` | 236 | DELETE | `/aps/:id` | sí | — | no | n/a | sql, network-admin | — |
| `ap.routes.js` | 252 | POST | `/aps/:id/refresh` | sí | — | no | n/a | sql | — |
| `ap.routes.js` | 277 | POST | `/aps/:id/poll` | sí | — | no | sí | sql, network-admin | — |
| `ap.routes.js` | 381 | POST | `/cpes/:mac/detail` | sí | — | no | sí | sql | — |
| `ap.routes.js` | 424 | GET | `/cpes` | sí | — | no | n/a | sql | — |
| `ap.routes.js` | 442 | GET | `/historial/:mac` | sí | — | no | n/a | sql | — |
| `ap.routes.js` | 458 | POST | `/poll-direct` | sí | — | no | sí | sql, network-admin | — |
| `ap.routes.js` | 582 | POST | `/reveal-ssh` | sí | — | no | sí | sql, network-admin | — |
| `ap.routes.js` | 600 | POST | `/ap-detail-direct` | sí | — | no | sí | sql, network-admin | — |
| `ap.routes.js` | 659 | POST | `/cpes/enrich-batch` | sí | — | no | sí | sql, network-admin | — |
| `ap.routes.js` | 718 | POST | `/cpes/:mac/detail-direct` | sí | — | no | sí | sql, network-admin | — |
| `ap.routes.js` | 845 | PUT | `/cpes/:mac/credentials` | sí | — | no | sí | sql | — |
| `ap.routes.js` | 869 | POST | `/poll-all-monitor` | sí | — | no | n/a | sql | — |
| `ap.routes.js` | 926 | GET | `/topology-cpes` | sí | — | no | n/a | sql, network-admin | — |
| `ap.routes.js` | 1023 | POST | `/watch` | sí | — | no | n/a | — | — |
| `ap.routes.js` | 1032 | GET | `/stations` | sí | — | no | n/a | sql | — |
| `auth.routes.js` | 35 | GET | `/status` | no | — | no | n/a | — | — |
| `auth.routes.js` | 45 | POST | `/setup` | no | — | sí | sí | — | — |
| `auth.routes.js` | 75 | POST | `/login` | no | — | sí | sí | — | — |
| `auth.routes.js` | 147 | GET | `/me` | sí | — | no | n/a | — | — |
| `auth.routes.js` | 173 | POST | `/password-reset/request` | no | — | sí | sí | — | — |
| `auth.routes.js` | 203 | POST | `/password-reset/confirm` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 146 | POST | `/register` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 173 | POST | `/verify` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 214 | POST | `/resend` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 228 | POST | `/login` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 244 | POST | `/logout` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 251 | POST | `/logout-all` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 258 | GET | `/session-status` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 262 | POST | `/session-renew` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 276 | GET | `/me` | no | — | no | n/a | — | — |
| `routes/account.routes.js` | 303 | PATCH | `/password` | sí | — | no | sí | — | — |
| `routes/account.routes.js` | 329 | PATCH | `/email/request` | sí | — | no | sí | — | — |
| `routes/account.routes.js` | 364 | POST | `/email/confirm` | sí | — | no | sí | network-admin | — |
| `routes/account.routes.js` | 420 | GET | `/notifications` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 435 | PATCH | `/notifications` | sí | — | no | sí | — | — |
| `routes/account.routes.js` | 453 | POST | `/telegram/link/start` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 463 | POST | `/telegram/unlink` | sí | — | no | n/a | — | — |
| `routes/admin.routes.js` | 85 | GET | `/operational-reset-preview` | sí | platform-admin | no | n/a | — | — |
| `routes/admin.routes.js` | 133 | GET | `/summary` | sí | platform-admin | no | n/a | — | — |
| `routes/admin.routes.js` | 138 | GET | `/moderators` | sí | platform-admin | no | n/a | — | — |
| `routes/admin.routes.js` | 186 | PATCH | `/moderators/:id/ai-access` | sí | platform-admin | no | sí | — | — |
| `routes/admin.routes.js` | 218 | PATCH | `/moderators/:id` | sí | platform-admin | no | sí | — | — |
| `routes/admin.routes.js` | 286 | DELETE | `/moderators/:id` | sí | platform-admin | no | n/a | network-admin | — |
| `routes/admin.routes.js` | 389 | POST | `/moderators` | sí | platform-admin | no | sí | — | — |
| `routes/admin.routes.js` | 421 | POST | `/invite-moderator` | sí | platform-admin | no | sí | — | — |
| `routes/admin.routes.js` | 489 | GET | `/invitations` | sí | platform-admin | no | n/a | — | — |
| `routes/admin.routes.js` | 504 | POST | `/invitations/:id/link` | sí | platform-admin | no | n/a | network-admin | — |
| `routes/adminSecurity.routes.js` | 53 | POST | `/step-up` | sí | — | no | sí | — | — |
| `routes/adminSecurity.routes.js` | 124 | GET | `/status` | sí | — | no | n/a | network-admin | — |
| `routes/adminSecurity.routes.js` | 174 | GET | `/history` | sí | — | no | n/a | — | — |
| `routes/adminSecurity.routes.js` | 176 | GET | `/attempts` | sí | — | no | n/a | — | — |
| `routes/adminSecurity.routes.js` | 178 | GET | `/web-observation` | sí | — | no | n/a | — | — |
| `routes/adminSecurity.routes.js` | 190 | GET | `/locked-accounts` | sí | — | no | n/a | — | — |
| `routes/adminSecurity.routes.js` | 203 | POST | `/locked-accounts/unlock` | sí | — | no | sí | — | — |
| `routes/adminSecurity.routes.js` | 232 | POST | `/ban` | sí | platform-admin | no | sí | — | — |
| `routes/adminSecurity.routes.js` | 237 | POST | `/unban` | sí | platform-admin | no | sí | — | — |
| `routes/adminSecurity.routes.js` | 241 | POST | `/make-indefinite` | sí | platform-admin | no | sí | — | — |
| `routes/adminSecurity.routes.js` | 251 | POST | `/trust` | sí | platform-admin | no | sí | — | — |
| `routes/adminSecurity.routes.js` | 265 | DELETE | `/trust` | sí | platform-admin | no | sí | — | — |
| `routes/ai.routes.js` | 56 | GET | `/status` | sí | — | no | n/a | — | — |
| `routes/ai.routes.js` | 80 | POST | `/consent` | sí | — | no | sí | — | — |
| `routes/ai.routes.js` | 86 | POST | `/device-analysis` | sí | — | no | sí | — | — |
| `routes/ai.routes.js` | 104 | POST | `/network-analysis` | sí | — | no | sí | — | — |
| `routes/ai.routes.js` | 150 | GET | `/analyses` | sí | — | no | n/a | — | — |
| `routes/ai.routes.js` | 159 | POST | `/analyses/device-history` | sí | — | no | sí | — | — |
| `routes/ai.routes.js` | 176 | GET | `/analyses/:uuid` | sí | — | no | n/a | — | — |
| `routes/ai.routes.js` | 185 | DELETE | `/analyses/:uuid` | sí | — | no | n/a | — | — |
| `routes/audit.routes.js` | 26 | GET | `/logs` | sí | — | no | n/a | — | — |
| `routes/audit.routes.js` | 33 | POST | `/log` | sí | — | no | sí | — | — |
| `routes/audit.routes.js` | 46 | POST | `/export` | sí | — | no | sí | — | — |
| `routes/core/connection.routes.js` | 19 | POST | `/connect` | sí | — | no | n/a | — | — |
| `routes/core/connection.routes.js` | 40 | GET | `/router/check` | sí | — | no | n/a | network-admin | — |
| `routes/core/connection.routes.js` | 54 | POST | `/diagnose` | sí | — | no | n/a | — | — |
| `routes/core/tunnel-repair.routes.js` | 26 | POST | `/tunnel/repair` | sí | — | no | sí | sql, network-admin | — |
| `routes/core/tunnel.routes.js` | 43 | POST | `/tunnel/activate` | sí | — | no | sí | network-admin | — |
| `routes/core/tunnel.routes.js` | 66 | POST | `/tunnel/deactivate` | sí | — | no | n/a | network-admin | — |
| `routes/core/tunnel.routes.js` | 78 | POST | `/tunnel/keepalive` | sí | — | no | n/a | — | — |
| `routes/core/tunnel.routes.js` | 124 | GET | `/tunnel/events` | sí | — | no | n/a | — | — |
| `routes/core/tunnel.routes.js` | 156 | GET | `/tunnel/status` | sí | — | no | n/a | network-admin | — |
| `routes/core/tunnel.routes.js` | 194 | GET | `/tunnel/my-mgmt-ip` | sí | — | no | n/a | — | — |
| `routes/core/tunnel.routes.js` | 215 | POST | `/tunnel/register-my-ip` | sí | — | no | sí | sql, network-admin | — |
| `routes/coreServer.routes.js` | 25 | GET | `/status` | sí | platform-admin | no | n/a | — | — |
| `routes/coreServer.routes.js` | 39 | POST | `/health` | sí | platform-admin | no | n/a | — | — |
| `routes/coreServer.routes.js` | 41 | GET | `/provision-preview` | sí | platform-admin | no | n/a | — | — |
| `routes/coreServer.routes.js` | 49 | GET | `/provision-history` | sí | platform-admin | no | n/a | — | — |
| `routes/coreServer.routes.js` | 53 | POST | `/provision` | sí | platform-admin | no | sí | — | — |
| `routes/coreServer.routes.js` | 79 | POST | `/backup-now` | sí | platform-admin | no | n/a | — | — |
| `routes/dashboard.routes.js` | 16 | GET | `/dashboard/metrics` | sí | — | no | n/a | — | — |
| `routes/device.routes.js` | 26 | POST | `/device/auto-login` | sí | — | no | sí | network-admin | — |
| `routes/device.routes.js` | 48 | POST | `/device/antenna` | sí | — | no | sí | sql, network-admin | — |
| `routes/device.routes.js` | 109 | GET | `/db/devices` | sí | — | no | n/a | sql | — |
| `routes/device.routes.js` | 181 | POST | `/db/devices` | sí | — | no | sí | sql | — |
| `routes/device.routes.js` | 287 | PUT | `/db/devices/:id` | sí | — | no | sí | sql | — |
| `routes/device.routes.js` | 354 | DELETE | `/db/devices/:id` | sí | — | no | n/a | sql | — |
| `routes/device.routes.js` | 363 | POST | `/db/cleanup-orphan-devices` | sí | — | no | n/a | sql | — |
| `routes/diagnostics.routes.js` | 76 | POST | `/diagnostics/ping` | sí | — | sí | sí | network-admin | — |
| `routes/diagnostics.routes.js` | 127 | POST | `/diagnostics/traceroute` | sí | — | sí | sí | network-admin | — |
| `routes/errorReports.routes.js` | 49 | POST | `/` | no | — | no | sí | — | `PUBLIC_MUTATION_REVIEW` |
| `routes/events.routes.js` | 13 | GET | `/stream` | sí | — | no | n/a | — | — |
| `routes/federatedAuth.routes.js` | 59 | GET | `/csrf` | no | — | no | n/a | — | — |
| `routes/federatedAuth.routes.js` | 67 | GET | `/link-status` | sí | — | no | n/a | — | — |
| `routes/federatedAuth.routes.js` | 87 | POST | `/link` | sí | — | sí | sí | — | — |
| `routes/federatedAuth.routes.js` | 174 | POST | `/unlink` | sí | — | sí | sí | — | — |
| `routes/federatedAuth.routes.js` | 207 | POST | `/exchange` | no | — | sí | sí | — | `PUBLIC_MUTATION_REVIEW` |
| `routes/health.routes.js` | 64 | GET | `/` | no | — | no | n/a | network-admin | — |
| `routes/health.routes.js` | 82 | GET | `/db` | no | — | no | n/a | — | — |
| `routes/nodes/credentials.routes.js` | 25 | POST | `/node/creds/save` | sí | — | no | sí | sql | — |
| `routes/nodes/credentials.routes.js` | 39 | POST | `/node/creds/get` | sí | — | no | sí | sql | — |
| `routes/nodes/credentials.routes.js` | 54 | POST | `/node/ssh-creds/save` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/credentials.routes.js` | 78 | POST | `/node/ssh-creds/get` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/editing.routes.js` | 31 | POST | `/node/edit` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/editing.routes.js` | 217 | POST | `/node/label/save` | sí | — | no | sí | sql | — |
| `routes/nodes/history.routes.js` | 21 | POST | `/node/history/add` | sí | — | no | sí | sql | — |
| `routes/nodes/history.routes.js` | 35 | POST | `/node/history/get` | sí | — | no | sí | sql | — |
| `routes/nodes/listing.routes.js` | 45 | POST | `/nodes` | sí | — | no | n/a | sql, network-admin | — |
| `routes/nodes/listing.routes.js` | 187 | POST | `/node/details` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/listing.routes.js` | 230 | POST | `/node/script` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/listing.routes.js` | 300 | POST | `/node/wg/set-peer` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/provision.routes.js` | 201 | POST | `/node/next` | sí | — | no | n/a | — | — |
| `routes/nodes/provision.routes.js` | 216 | POST | `/node/provision` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/provision.routes.js` | 591 | POST | `/node/deprovision-impact` | sí | — | no | sí | — | — |
| `routes/nodes/provision.routes.js` | 603 | POST | `/node/deprovision` | sí | — | no | sí | network-admin | — |
| `routes/nodes/scan.routes.js` | 51 | POST | `/node/scan-stream` | sí | — | no | sí | network-admin | — |
| `routes/nodes/tags.routes.js` | 16 | GET | `/node/tags` | sí | — | no | n/a | sql | — |
| `routes/nodes/tags.routes.js` | 41 | POST | `/node/tag/save` | sí | — | no | sí | sql | — |
| `routes/settings.routes.js` | 40 | GET | `/settings/get` | sí | platform-admin | no | n/a | sql | — |
| `routes/settings.routes.js` | 71 | GET | `/settings/scan-local-check` | sí | platform-admin | no | n/a | sql | — |
| `routes/settings.routes.js` | 82 | GET | `/settings/management-supernet-preview` | sí | platform-admin | no | n/a | network-admin | — |
| `routes/settings.routes.js` | 89 | POST | `/settings/test-core-connection` | sí | platform-admin | no | sí | network-admin | — |
| `routes/settings.routes.js` | 115 | POST | `/settings/save` | sí | platform-admin | no | sí | sql, network-admin | — |
| `routes/settings.routes.js` | 190 | POST | `/settings/test-error-email` | sí | platform-admin | no | n/a | — | — |
| `routes/team.routes.js` | 218 | POST | `/invite` | sí | OWNER | no | sí | — | — |
| `routes/team.routes.js` | 277 | POST | `/accept` | no | — | sí | sí | network-admin | `PUBLIC_MUTATION_REVIEW` |
| `routes/team.routes.js` | 385 | GET | `/my-invitations` | sí | — | no | n/a | — | — |
| `routes/team.routes.js` | 393 | POST | `/invitations/:id/accept` | sí | — | no | sí | network-admin | — |
| `routes/team.routes.js` | 447 | GET | `/members` | sí | — | no | n/a | — | — |
| `routes/team.routes.js` | 453 | GET | `/invitations` | sí | OWNER | no | n/a | network-admin | — |
| `routes/team.routes.js` | 468 | PATCH | `/member/:userId` | sí | OWNER | no | sí | sql | — |
| `routes/team.routes.js` | 530 | DELETE | `/member/:userId` | sí | OWNER | no | n/a | sql, network-admin | — |
| `routes/team.routes.js` | 587 | POST | `/invitation/:id/revoke` | sí | OWNER | no | n/a | network-admin | — |
| `routes/team.routes.js` | 598 | GET | `/workspace-tunnels` | sí | OWNER | no | n/a | — | — |
| `routes/team.routes.js` | 614 | GET | `/assignments` | sí | — | no | n/a | — | — |
| `routes/team.routes.js` | 623 | POST | `/assignments` | sí | OWNER | no | sí | — | — |
| `routes/team.routes.js` | 635 | DELETE | `/assignments/:id` | sí | OWNER | no | n/a | network-admin | — |
| `routes/team.routes.js` | 647 | POST | `/member/:id/wireguard` | sí | OWNER | no | sí | sql, network-admin | — |
| `routes/team.routes.js` | 731 | POST | `/me/wireguard` | sí | — | no | n/a | network-admin | — |
| `routes/team.routes.js` | 760 | GET | `/member/:id/wireguard` | sí | — | no | n/a | network-admin | — |
| `routes/team.routes.js` | 781 | GET | `/wireguard/by-key/:publicKey` | sí | OWNER | no | n/a | network-admin | — |
| `routes/wireguard.routes.js` | 39 | POST | `/wireguard/peers` | sí | — | no | n/a | sql, network-admin | — |
| `routes/wireguard.routes.js` | 151 | POST | `/wireguard/peer/add` | sí | — | no | sí | sql, network-admin | — |
| `routes/wireguard.routes.js` | 200 | POST | `/wireguard/peer/edit` | sí | — | no | sí | sql, network-admin | — |
| `routes/wireguard.routes.js` | 234 | POST | `/wireguard/peer/color/save` | sí | — | no | sí | sql, network-admin | — |
| `routes/wireguard.routes.js` | 244 | GET | `/wireguard/peer/colors` | sí | — | no | n/a | sql, network-admin | — |
| `routes/wireguard.routes.js` | 257 | POST | `/wireguard/peer/alias/save` | sí | — | no | sí | sql, network-admin | — |
| `routes/workspace.routes.js` | 36 | GET | `/export` | sí | OWNER | no | n/a | network-admin | — |
| `routes/workspace.routes.js` | 135 | POST | `/import` | sí | OWNER | no | sí | network-admin | — |
