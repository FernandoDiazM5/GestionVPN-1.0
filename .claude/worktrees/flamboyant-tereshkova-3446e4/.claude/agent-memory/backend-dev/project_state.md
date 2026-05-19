---
name: project_state
description: Estado actual del backend: rutas modulares, persistencia de túnel VPN en SQLite, helpers disponibles
type: project
---

## Persistencia de estado del túnel VPN (2026-03-28)

`GET /tunnel/status` persiste en SQLite via `app_settings` (claves `active_vrf` y `tunnel_expiry`).
Permite que cualquier PC/dispositivo consulte el túnel activo, no solo el navegador que lo activó.

**Why:** El estado del túnel vivía solo en memoria del frontend (IndexedDB). Si se abría desde otro dispositivo, no había forma de saber si había un túnel activo.

**How to apply:** Cualquier feature que necesite estado compartido entre sesiones debe usar `setAppSetting`/`getAppSetting` de `db.service.js`, que hace UPSERT sobre la tabla `app_settings (key TEXT PRIMARY KEY, value TEXT)`.

## Helpers exportados en db.service.js relevantes

- `setAppSetting(key, value)` — UPSERT en `app_settings`
- `getAppSetting(key)` — SELECT con fallback `null`
- `encryptPass` / `decryptPass` — AES-256-GCM para credenciales
- `saveNode` / `getNodes` / `deleteNode` — CRUD nodos SSTP

## Rutas core.routes.js — endpoints de túnel

| Método | Ruta | Efecto en SQLite |
|--------|------|-----------------|
| POST | `/tunnel/activate` | Guarda `active_vrf` + `tunnel_ip` + `tunnel_expiry` (30 min) |
| POST | `/tunnel/deactivate` | Limpia `active_vrf`, `tunnel_ip`, `tunnel_expiry` a '' |
| GET  | `/tunnel/status` | Lee estado; auto-limpia si expiró (incluye `tunnel_ip`) |

## TUNNEL_TIMEOUT_MS

`30 * 60 * 1000` (30 minutos). Debe mantenerse sincronizado con el valor del frontend.

## Patrón cleanTunnelRules — SIEMPRE pasar tunnelIP (2026-03-28)

`cleanTunnelRules(api, tunnelIP)` acepta un segundo parámetro `tunnelIP`.

- Con `tunnelIP` especificado: solo elimina `vpn-activa` donde `address === tunnelIP` y mangle donde `src-address === tunnelIP AND comment === 'WEB-ACCESS'`.
- Sin `tunnelIP` (null/undefined): comportamiento legacy — elimina TODAS las entradas (NO usar en producción, preservado solo para compatibilidad).

**Why:** La tabla `vpn-activa` en el MikroTik real puede contener entradas permanentes o de otros usuarios. Borrar todo de forma global destruye esas configuraciones.

**How to apply:** Cualquier endpoint que limpie reglas de firewall DEBE pasar la IP específica. En `tunnel/deactivate`, la IP se lee de `getAppSetting('tunnel_ip')` (guardada durante activate) con fallback `req.body.tunnelIP`. Si no hay IP conocida, omitir la limpieza en lugar de borrar todo.

## POST /tunnel/repair — reparación completa de nodo VPN (2026-03-28)

Endpoint que verifica y reconstruye los 7 objetos RouterOS de un nodo VPN en una sola pasada.

**Body:** `{ pppUser, vrfName, lanSubnets[], tunnelIP?, adminWgNet? }`

**Patrón aplicado:**
1. Una sola conexión RouterOS → 6 lecturas en paralelo con `Promise.allSettled`.
2. Cada paso tiene try/catch individual para no bloquear los siguientes si uno falla.
3. `ifaceName = vrfName.replace(/^VRF-/, 'VPN-SSTP-')` — derivado del vrfName, no enviado por el frontend.
4. Pasos 6 y 7 (vpn-activa y mangle WEB-ACCESS) son condicionales a `tunnelIP` presente.
5. VRF existente pero sin la interfaz: usa `/ip/vrf/set` con las interfaces actuales + la nueva (no recrea).
6. Retorna `{ success, steps[], repaired }` donde cada step tiene `{ step, obj, name, status, action }`.

**Status values por paso:** `ok` (ya existía) | `created` (se creó) | `error` (falló) | `skipped` (tunnelIP null)

**Why:** Permite recuperar nodos que quedan en estado inconsistente tras un reboot del MikroTik, una migración de config, o una provisión parcialmente fallida.

**How to apply:** Si un frontend detecta que un nodo "está en SQLite pero no responde en MikroTik", llamar este endpoint con los datos del nodo. No requiere deprovision previo — es idempotente.

## Patrón tunnel/activate — agregar solo si no existe (2026-03-28)

En `tunnel/activate`:
1. Leer `address-list/print` en una sola conexión.
2. Agregar `192.168.21.0/24` a `vpn-activa` solo si no existe ya.
3. NO crear regla mangle aquí — la responsabilidad es de `/tunnel/mangle-access`.
4. Guardar `tunnel_ip` en `app_settings` junto con `active_vrf` y `tunnel_expiry`.

## Fix: Una sola regla mangle ACCESO-ADMIN (2026-04-19)

**Problema:** Se creaban 2 reglas mangle duplicadas con `src-address=192.168.21.0/24`:
- `tunnel/activate` creaba `ACCESO-ADMIN`
- `tunnel/mangle-access` creaba `ACCESO-DINAMICO` (con la misma subred)
- `keepalive` recreaba 2 reglas `ACCESO-DINAMICO` (VPS + pool)

**Fix aplicado:**
- `tunnel/activate`: eliminado el bloque `apiAdmin` que creaba `ACCESO-ADMIN`. Solo gestiona `vpn-activa` y SQLite.
- `tunnel/mangle-access`: Fase 1 limpia AMBOS comments (`ACCESO-DINAMICO` y `ACCESO-ADMIN`). Fase 2 crea UNA sola regla `comment=ACCESO-ADMIN`, `src-address=192.168.21.0/24`. Eliminada la lógica `inAdminPool`, `srcVps`, `srcOp`, y la regla VPS separada.
- `tunnel/keepalive`: verifica `ACCESO-ADMIN` (no `ACCESO-DINAMICO`). Recrea UNA sola regla con `src=192.168.21.0/24`.
- `tunnel/deactivate`: eliminado el bloque manual que borraba `ACCESO-ADMIN` (ya lo hace `cleanTunnelRules`).
- `cleanTunnelRules` en `routeros.service.js`: `mangleFilter` ahora limpia ambos comments: `ACCESO-DINAMICO` y `ACCESO-ADMIN`. Simplificado — ya no verifica `tunnelIP` en el mangle (los comments son suficiente clave de identificación).
- `/tunnel/repair` paso 7: actualizado para crear una sola regla `ACCESO-ADMIN` en lugar de dos `ACCESO-DINAMICO`.
- `IP_VPS` eliminada de `core.routes.js` — ya no se necesita.

**Invariante:** En RouterOS siempre debe existir exactamente 1 regla mangle activa cuando hay un túnel activado: `comment=ACCESO-ADMIN`, `chain=prerouting`, `action=mark-routing`, `src-address=192.168.21.0/24`, `dst-address-list=LIST-NET-REMOTE-TOWERS`, `new-routing-mark=<VRF activo>`, `passthrough=yes`.
