# ✅ Implementación Fases 1–4 — Multi-usuario (estado)

> Completado 2026-06-06. Fase 5 (firewall defensa-en-profundidad) queda para revisión.
> Verificado: `node --check` OK · `require` OK · `tsc --noEmit` OK · migración BD aplicada.

## Qué se implementó

### FASE 1 — Base de datos
- `server/sql/schema_multiuser.sql` — 3 tablas: `user_mgmt_ips`, `tunnel_user_sessions`, `tunnel_session_logs`.
- `server/db/initMultiuser.js` + script `npm run init:multiuser` (aditivo, idempotente, con backfill).
- `server/db/repos/mgmtIpRepo.js` — mapeo usuario↔IP (anti-spoofing).
- `server/db/repos/sessionRepo.js` — sesiones (1 ACTIVE/usuario por transacción) + auditoría.
- ✔ Ejecutada: 3 tablas creadas, 1 miembro mapeado automáticamente desde `member_wireguard`.

### FASE 2 — MikroTik (provisión por código)
- `server/lib/tunnelProvisioner.js` — mangle **por IP** (`ACCESO-USER-<id>`), lecturas/escrituras
  en conexiones separadas (patrón anti-desync node-routeros), cleanup por `comment`.

### FASE 3 — Backend
- `core.routes.js` reescrito **por usuario**:
  - `/tunnel/activate` — valida permiso + resuelve IP server-side + cierra TU sesión previa + crea mangle por-IP + sesión BD + SSE a tu usuario. Contención con rollback de mangle parcial.
  - `/tunnel/deactivate` — cierra SOLO tu sesión.
  - `/tunnel/keepalive` — recrea TU mangle si falta + renueva TTL.
  - `/tunnel/status` + SSE `/tunnel/events` — **por usuario** (mapa `userId→clientes`), con expiración perezosa.
  - `/tunnel/my-mgmt-ip` (GET) + `/tunnel/register-my-ip` (POST) — auto-registro validado contra peers reales.
- `node.routes.js` — `/nodes` anota `running_by_you` y `active_by_other` (admin); `running` es per-usuario.

### FASE 4 — Frontend
- `types/api.ts` — `NodeInfo.running_by_you/active_by_other`, `TunnelActivateResponse.sessionId/tunnelExpiry/code`.
- `useNodeActivation.ts` — sin deactivate global; payload `{ targetVRF }`; maneja 409 `NO_MGMT_IP`; usa `tunnelExpiry` del backend.
- `useNodeManagement.ts` — `deactivateAllNodes` ahora cierra solo la sesión propia (backend).
- `NodeCardNameSection.tsx` — badge "en uso por X" (visibilidad admin).
- `activeNodeVrf` pasa a ser **por usuario** (status/SSE filtrados) → cada quien ve solo su túnel.

## Acción pendiente ANTES de probar en producción
1. **Mapear al OWNER (fernando)** — no tiene `member_wireguard`. Opciones:
   - Vía API (logueado como fernando): `POST /api/tunnel/register-my-ip { "mgmtIp": "192.168.21.20" }`
     (valida que el peer exista en VPN-WG-MGMT).
   - O SQL directo en `user_mgmt_ips`.
   - Confirmar la IP real con `/interface/wireguard/peers/print`.
2. **Quitar la mangle global** del router (corte controlado, ver PLAN_IMPL_DETALLADO §3.2):
   `/ip firewall mangle remove [find comment="ACCESO-ADMIN"]`

## Pendiente (post F1–F4)
- **Fase 5** (opcional, a revisar): firewall por-IP + `LIST-NET-ND<n>-ONLY` + acotar regla "Admin MGMT libre".
- UI de auto-registro de IP de gestión (hoy es endpoint; falta el formulario).
- Job de expiración batch (hoy es perezoso en `/tunnel/status`).
- Atar el escaneo (`device.routes.js`) al `mgmt_ip` del solicitante.

## Cómo probar (matriz mínima)
Ver PLAN_IMPL_DETALLADO §7. Esencial:
- A(.20)→ND1 y B(.61)→ND4 simultáneos → ambos navegan su LAN; ninguno ve el túnel del otro.
- A cambia ND1→ND5 → su sesión previa se cierra sola; la de B intacta.
- A no puede desactivar la sesión de B (cada deactivate es por `req.account.sub`).
- Anti-spoof: el body no puede forzar otra IP (siempre se usa `user_mgmt_ips`).
