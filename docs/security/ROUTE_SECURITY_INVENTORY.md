# Inventario de seguridad de rutas API

> Archivo generado por `server/tools/security-route-inventory.js`. No editar manualmente.

Este inventario es una línea base estática para priorizar el hardening. No sustituye pruebas de integración ni una revisión manual de autorización por recurso.

## Resumen

- Rutas detectadas: 148
- Rutas de mutación (POST/PUT/PATCH): 98
- Rutas que consumen `req.body`: 76
- Rutas con esquema de `req.body` detectable: 76/76
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
| `ap.routes.js` | 627 | POST | `/cpes/enrich-batch` | sí | — | no | sí | sql, network-admin | — |
| `ap.routes.js` | 686 | POST | `/cpes/:mac/detail-direct` | sí | — | no | sí | sql, network-admin | — |
| `ap.routes.js` | 813 | PUT | `/cpes/:mac/credentials` | sí | — | no | sí | sql | — |
| `ap.routes.js` | 837 | POST | `/poll-all-monitor` | sí | — | no | n/a | sql | — |
| `ap.routes.js` | 894 | GET | `/topology-cpes` | sí | — | no | n/a | sql, network-admin | — |
| `ap.routes.js` | 991 | POST | `/watch` | sí | — | no | n/a | — | — |
| `ap.routes.js` | 1000 | GET | `/stations` | sí | — | no | n/a | sql | — |
| `auth.routes.js` | 35 | GET | `/status` | no | — | no | n/a | — | — |
| `auth.routes.js` | 45 | POST | `/setup` | no | — | sí | sí | — | — |
| `auth.routes.js` | 75 | POST | `/login` | no | — | sí | sí | — | — |
| `auth.routes.js` | 143 | GET | `/me` | sí | — | no | n/a | — | — |
| `auth.routes.js` | 169 | POST | `/password-reset/request` | no | — | sí | sí | — | — |
| `auth.routes.js` | 199 | POST | `/password-reset/confirm` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 81 | POST | `/register` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 108 | POST | `/verify` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 149 | POST | `/resend` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 163 | POST | `/login` | no | — | sí | sí | — | — |
| `routes/account.routes.js` | 176 | POST | `/logout` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 183 | POST | `/logout-all` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 190 | GET | `/session-status` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 194 | POST | `/session-renew` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 208 | GET | `/me` | no | — | no | n/a | — | — |
| `routes/account.routes.js` | 234 | PATCH | `/password` | sí | — | no | sí | — | — |
| `routes/account.routes.js` | 260 | PATCH | `/email/request` | sí | — | no | sí | — | — |
| `routes/account.routes.js` | 295 | POST | `/email/confirm` | sí | — | no | sí | — | — |
| `routes/account.routes.js` | 348 | GET | `/notifications` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 363 | PATCH | `/notifications` | sí | — | no | sí | — | — |
| `routes/account.routes.js` | 381 | POST | `/telegram/link/start` | sí | — | no | n/a | — | — |
| `routes/account.routes.js` | 391 | POST | `/telegram/unlink` | sí | — | no | n/a | — | — |
| `routes/admin.routes.js` | 127 | GET | `/summary` | sí | platform-admin | no | n/a | — | — |
| `routes/admin.routes.js` | 132 | GET | `/moderators` | sí | platform-admin | no | n/a | — | — |
| `routes/admin.routes.js` | 179 | PATCH | `/moderators/:id/ai-access` | sí | platform-admin | no | sí | — | — |
| `routes/admin.routes.js` | 211 | PATCH | `/moderators/:id` | sí | platform-admin | no | sí | — | — |
| `routes/admin.routes.js` | 282 | DELETE | `/moderators/:id` | sí | platform-admin | no | n/a | network-admin | — |
| `routes/admin.routes.js` | 384 | POST | `/moderators` | sí | platform-admin | no | sí | — | — |
| `routes/admin.routes.js` | 416 | POST | `/invite-moderator` | sí | platform-admin | no | sí | — | — |
| `routes/admin.routes.js` | 483 | GET | `/invitations` | sí | platform-admin | no | n/a | — | — |
| `routes/admin.routes.js` | 498 | POST | `/invitations/:id/link` | sí | platform-admin | no | n/a | network-admin | — |
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
| `routes/coreServer.routes.js` | 23 | GET | `/status` | sí | platform-admin | no | n/a | — | — |
| `routes/coreServer.routes.js` | 37 | POST | `/health` | sí | platform-admin | no | n/a | — | — |
| `routes/coreServer.routes.js` | 39 | GET | `/provision-preview` | sí | platform-admin | no | n/a | — | — |
| `routes/coreServer.routes.js` | 47 | POST | `/provision` | sí | platform-admin | no | sí | — | — |
| `routes/coreServer.routes.js` | 57 | POST | `/backup-now` | sí | platform-admin | no | n/a | — | — |
| `routes/dashboard.routes.js` | 16 | GET | `/dashboard/metrics` | sí | — | no | n/a | — | — |
| `routes/device.routes.js` | 26 | POST | `/device/auto-login` | sí | — | no | sí | network-admin | — |
| `routes/device.routes.js` | 48 | POST | `/device/antenna` | sí | — | no | sí | sql, network-admin | — |
| `routes/device.routes.js` | 109 | GET | `/db/devices` | sí | — | no | n/a | sql | — |
| `routes/device.routes.js` | 157 | POST | `/db/devices` | sí | — | no | sí | sql | — |
| `routes/device.routes.js` | 263 | PUT | `/db/devices/:id` | sí | — | no | sí | sql | — |
| `routes/device.routes.js` | 330 | DELETE | `/db/devices/:id` | sí | — | no | n/a | sql | — |
| `routes/device.routes.js` | 339 | POST | `/db/cleanup-orphan-devices` | sí | — | no | n/a | sql | — |
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
| `routes/nodes/editing.routes.js` | 25 | POST | `/node/edit` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/editing.routes.js` | 197 | POST | `/node/label/save` | sí | — | no | sí | sql | — |
| `routes/nodes/history.routes.js` | 21 | POST | `/node/history/add` | sí | — | no | sí | sql | — |
| `routes/nodes/history.routes.js` | 35 | POST | `/node/history/get` | sí | — | no | sí | sql | — |
| `routes/nodes/listing.routes.js` | 47 | POST | `/nodes` | sí | — | no | n/a | sql, network-admin | — |
| `routes/nodes/listing.routes.js` | 188 | POST | `/node/details` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/listing.routes.js` | 231 | POST | `/node/script` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/listing.routes.js` | 303 | POST | `/node/wg/set-peer` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/provision.routes.js` | 239 | POST | `/node/next` | sí | — | no | n/a | — | — |
| `routes/nodes/provision.routes.js` | 254 | POST | `/node/provision` | sí | — | no | sí | sql, network-admin | — |
| `routes/nodes/provision.routes.js` | 614 | POST | `/node/deprovision` | sí | — | no | sí | — | — |
| `routes/nodes/scan.routes.js` | 51 | POST | `/node/scan-stream` | sí | — | no | sí | network-admin | — |
| `routes/nodes/tags.routes.js` | 16 | GET | `/node/tags` | sí | — | no | n/a | sql | — |
| `routes/nodes/tags.routes.js` | 41 | POST | `/node/tag/save` | sí | — | no | sí | sql | — |
| `routes/settings.routes.js` | 31 | GET | `/settings/get` | sí | — | no | n/a | sql | — |
| `routes/settings.routes.js` | 62 | GET | `/settings/scan-local-check` | sí | — | no | n/a | sql | — |
| `routes/settings.routes.js` | 73 | POST | `/settings/save` | sí | — | no | sí | sql, network-admin | — |
| `routes/settings.routes.js` | 125 | POST | `/settings/test-error-email` | sí | — | no | n/a | — | — |
| `routes/team.routes.js` | 218 | POST | `/invite` | sí | OWNER | no | sí | — | — |
| `routes/team.routes.js` | 277 | POST | `/accept` | no | — | sí | sí | network-admin | `PUBLIC_MUTATION_REVIEW` |
| `routes/team.routes.js` | 384 | GET | `/my-invitations` | sí | — | no | n/a | — | — |
| `routes/team.routes.js` | 392 | POST | `/invitations/:id/accept` | sí | — | no | sí | network-admin | — |
| `routes/team.routes.js` | 446 | GET | `/members` | sí | — | no | n/a | — | — |
| `routes/team.routes.js` | 452 | GET | `/invitations` | sí | OWNER | no | n/a | network-admin | — |
| `routes/team.routes.js` | 467 | PATCH | `/member/:userId` | sí | OWNER | no | sí | sql | — |
| `routes/team.routes.js` | 529 | DELETE | `/member/:userId` | sí | OWNER | no | n/a | sql, network-admin | — |
| `routes/team.routes.js` | 586 | POST | `/invitation/:id/revoke` | sí | OWNER | no | n/a | network-admin | — |
| `routes/team.routes.js` | 597 | GET | `/workspace-tunnels` | sí | OWNER | no | n/a | — | — |
| `routes/team.routes.js` | 613 | GET | `/assignments` | sí | — | no | n/a | — | — |
| `routes/team.routes.js` | 622 | POST | `/assignments` | sí | OWNER | no | sí | — | — |
| `routes/team.routes.js` | 634 | DELETE | `/assignments/:id` | sí | OWNER | no | n/a | network-admin | — |
| `routes/team.routes.js` | 646 | POST | `/member/:id/wireguard` | sí | OWNER | no | sí | sql, network-admin | — |
| `routes/team.routes.js` | 730 | POST | `/me/wireguard` | sí | — | no | n/a | network-admin | — |
| `routes/team.routes.js` | 759 | GET | `/member/:id/wireguard` | sí | — | no | n/a | network-admin | — |
| `routes/team.routes.js` | 780 | GET | `/wireguard/by-key/:publicKey` | sí | OWNER | no | n/a | network-admin | — |
| `routes/wireguard.routes.js` | 25 | POST | `/wireguard/peers` | sí | — | no | n/a | sql, network-admin | — |
| `routes/wireguard.routes.js` | 122 | POST | `/wireguard/peer/add` | sí | — | no | sí | sql, network-admin | — |
| `routes/wireguard.routes.js` | 171 | POST | `/wireguard/peer/edit` | sí | — | no | sí | sql, network-admin | — |
| `routes/wireguard.routes.js` | 205 | POST | `/wireguard/peer/color/save` | sí | — | no | sí | sql, network-admin | — |
| `routes/wireguard.routes.js` | 215 | GET | `/wireguard/peer/colors` | sí | — | no | n/a | sql, network-admin | — |
| `routes/wireguard.routes.js` | 228 | POST | `/wireguard/peer/alias/save` | sí | — | no | sí | sql, network-admin | — |
| `routes/workspace.routes.js` | 37 | PATCH | `/name` | sí | OWNER | no | sí | — | — |
| `routes/workspace.routes.js` | 51 | GET | `/export` | sí | OWNER | no | n/a | network-admin | — |
| `routes/workspace.routes.js` | 150 | POST | `/import` | sí | OWNER | no | sí | network-admin | — |
