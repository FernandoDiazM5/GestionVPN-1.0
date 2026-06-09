# 🛠️ Plan de Implementación Detallado — Multi-usuario (config real RB750GL)

> Ingeniería de sistemas + redes. Basado en **tu** `Configuracion_vpn.rsc` y el código real.
> Regla: **1 túnel activo por usuario**. Objetivo: aislamiento de visibilidad y de ruteo por usuario.
> Router: **RB750GL · RouterOS 7.19.3** (256 MB RAM, CPU modesto → el diseño respeta ese límite).
> Fecha: 2026-06-06

---

## 0. HALLAZGO CLAVE (cambia el diseño respecto al plan genérico)

### 0.1 En tu config, el aislamiento YA es por ruteo, no por firewall
Tu cadena `forward` (config.rsc:232-246) hoy **no** restringe por usuario:
- Línea 235-237: `accept src-address-list=vpn-activa dst-address-list=LIST-NET-REMOTE-TOWERS`
  → `vpn-activa` = **todo** `192.168.21.0/24` (config.rsc:199).
- Línea 241-242: `accept in-interface=VPN-WG-MGMT` ("Admin MGMT libre") → deja pasar **todo** lo que entra por gestión.

→ **El control de acceso real lo hace el MANGLE + VRF**, no el firewall:
si tu paquete a `10.1.1.0/24` **no** recibe `routing-mark`, se busca en la tabla `main`,
**no hay ruta** → se descarta. El acceso existe **solo** si hay una mangle que marque tu tráfico.

### 0.2 Consecuencia: el cambio mínimo y robusto es "mangle por IP"
Si cada usuario tiene **su propia mangle** `src=<su IP> → <su VRF>`:

```
Usuario A (192.168.21.20) → mangle → VRF-ND1 → ruta a 10.1.1.0/24      ✓ llega
Usuario B (192.168.21.51) → mangle → VRF-ND4 → ruta a 142.152.7.0/24   ✓ llega
Usuario B intenta 10.1.1.0/24 → su mark es VRF-ND4 → tabla VRF-ND4 no
   tiene ruta a 10.1.1.0/24 → DESCARTADO                                ✓ aislado
```

**El mismo mecanismo resuelve los 3 problemas a la vez:**
1. Multi-usuario simultáneo (N mangle = N VRFs).
2. Conflicto de LANs duplicadas (ND5 y ND13 = `192.168.8.0/24`): cada usuario marcado
   a su VRF, la tabla del VRF solo enruta su propia LAN.
3. Aislamiento (sin mangle propia, no hay ruta → no hay acceso).

> ✅ **Decisión de ingeniería:** el núcleo del cambio es **routing-based** (mangle por IP).
> El firewall por-usuario es **defensa en profundidad opcional** (Fase 5), porque tocar
> tus reglas `forward` actuales tiene más riesgo y el ruteo ya aísla.

### 0.3 Riesgo detectado a contener
La regla **"Admin MGMT libre"** (config.rsc:241) + `vpn-activa=/24` permiten *forward* a todos.
No rompe el aislamiento de **ruteo**, pero impide un aislamiento de **firewall** real.
→ Se aborda explícitamente en Fase 5 (no se toca hasta entonces).

---

## 1. INVENTARIO DE TU CONFIG ACTUAL (lo que el plan debe respetar)

| Objeto | Valor real | Ref |
|--------|-----------|-----|
| Red de gestión | `VPN-WG-MGMT` = `192.168.21.0/24`, gw `192.168.21.1` | rsc:154 |
| Peers MGMT existentes | `.20` laptop, `.30` celular, `.50` PC FiWis, `.51` plopis, `.60` VPS, `.61` member | rsc:101-147 |
| Pool a respetar | `.1`-`.19` reservados; usuarios reales en `.20`+ | rsc:74 (lógica backend) |
| Túneles SSTP | ND1-HOUSENET (`10.1.1.0/24`), ND3-TORREVIRGINIA2 | rsc:9-10, 360-363 |
| Túneles WG | ND4-ND13 | rsc:14-33 |
| VRFs | uno por nodo (`VRF-ND1..ND13`) | rsc:45-63 |
| LANs duplicadas | `142.152.7.0/24` (ND4,6,10,11,12), `192.168.8.0/24` (ND5,ND13) | rsc:113-143 |
| Mangle actual | 1 sola: `ACCESO-ADMIN src=192.168.21.0/24 → VRF-ND1-HOUSENET` | rsc:248-250 |
| address-list | `vpn-activa`=/24, `LIST-NET-REMOTE-TOWERS`, `LIST-MGMT-TRUSTED` | rsc:182-216 |
| Acceso API | `192.168.21.0/24` + IPs fijas (rsc:357) | rsc:357 |

> ⚠️ El mangle de la línea 248 está **guardado en la config**. El backend lo reescribe en cada
> activación ([core.routes.js:155-186](server/routes/core.routes.js)). La migración debe contar con que
> tras un reboot del RB750GL, esa regla "vuelve" apuntando a ND1.

---

## 2. EL EJE: mapear `usuario de la app → su IP de gestión`

Sin esto, nada funciona (hoy `adminIP` está hardcodeado a `192.168.21.20` para todos —
[useNodeManagement.ts:10](vpn-manager/src/context/hooks/useNodeManagement.ts)).

### 2.1 Tabla (MySQL)
```sql
CREATE TABLE IF NOT EXISTS user_mgmt_ips (
  id           CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  user_id      CHAR(36) NOT NULL,
  mgmt_ip      VARCHAR(64) NOT NULL,        -- 192.168.21.x
  public_key   VARCHAR(120) DEFAULT NULL,
  source       ENUM('member_wg','mgmt_peer','manual') NOT NULL,
  created_at   BIGINT NOT NULL,
  UNIQUE KEY uq_user (workspace_id, user_id),
  UNIQUE KEY uq_ip (mgmt_ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 2.2 Poblado con TUS datos
- **MEMBER:** desde `member_wireguard.allowed_ip` (ej. peer27 = `.61`).
- **OWNER/CO_MOD:** al crear peer ([wireguard.routes.js:76](server/routes/wireguard.routes.js)),
  escribir también `user_mgmt_ips` con `user_id`.
- **Backfill manual inicial** (mapeo de los peers ya existentes):
  | Peer | IP | Asignar a usuario |
  |------|----|--------------------|
  | peer2 (laptop) | `.20` | fernando (OWNER) |
  | peer3 (PC FiWis)| `.50` | frank/FIWIS |
  | peer27 (member) | `.61` | miembro `5471890c...` |
  > Confirmar con `/interface/wireguard/peers/print` antes de mapear.

### 2.3 Validación dura (anti-spoofing)
La IP de la mangle se toma **siempre** de `user_mgmt_ips` (server-side).
El cliente **nunca** envía su IP. Si un usuario no tiene `mgmt_ip` → `409` y se aborta.

---

## 3. CAMBIOS EN MIKROTIK (comandos exactos para tu router)

### 3.1 Pre-check (ejecutar y guardar salida ANTES de tocar nada)
```rsc
/export file=backup-pre-multiuser          ;# respaldo completo
/ip firewall mangle print where comment~"ACCESO"
/ip firewall address-list print where list="LIST-NET-REMOTE-TOWERS"
/ip route print where routing-table~"VRF"
/interface/wireguard/peers/print
```

### 3.2 Quitar la mangle global (la del /24) — paso de corte
```rsc
/ip firewall mangle remove [find comment="ACCESO-ADMIN"]
```
> Tras esto, **nadie** tiene acceso hasta que su mangle por-IP se cree (estado limpio).

### 3.3 Mangle POR USUARIO (lo que el backend hará al activar)
Ejemplo real: usuario en `.20` activa **ND1**:
```rsc
/ip firewall mangle add \
  chain=prerouting action=mark-routing \
  src-address=192.168.21.20 \
  dst-address-list=LIST-NET-REMOTE-TOWERS \
  new-routing-mark=VRF-ND1-HOUSENET \
  comment="ACCESO-USER-<user_id8>" passthrough=yes
```
Usuario en `.51` activa **ND4** (coexiste):
```rsc
/ip firewall mangle add \
  chain=prerouting action=mark-routing \
  src-address=192.168.21.51 \
  dst-address-list=LIST-NET-REMOTE-TOWERS \
  new-routing-mark=VRF-ND4-TORREVICTORN2 \
  comment="ACCESO-USER-<user_id8B>" passthrough=yes
```

### 3.4 Cambio de túnel (mismo usuario) = cerrar el suyo y recrear
```rsc
/ip firewall mangle remove [find comment="ACCESO-USER-<user_id8>"]
# luego add con el nuevo VRF (sección 3.3)
```
> Solo afecta **su** regla. Las de otros usuarios quedan intactas.

### 3.5 Desactivar
```rsc
/ip firewall mangle remove [find comment="ACCESO-USER-<user_id8>"]
```

### 3.6 Verificación de orden de reglas (importante en RB750GL)
La mangle en `prerouting` debe evaluarse **antes** de cualquier `mark-routing` previa.
Como cada regla filtra por `src-address` único, el orden entre ellas es indiferente,
pero deben estar todas activas. Validar:
```rsc
/ip firewall mangle print where comment~"ACCESO-USER"
```

### 3.7 Persistencia tras reboot
El RB750GL recargará la config guardada (que YA NO tiene la mangle global tras 3.2,
si guardas). Las mangle por-usuario son **dinámicas** (las crea el backend) → tras reboot
no existen hasta que cada usuario reactive. El **keepalive** las recrea
([core.routes.js:233](server/routes/core.routes.js)) → adaptarlo a por-usuario (Fase 4).

---

## 4. CAMBIOS EN BACKEND (Express) — con validaciones y contención

### 4.1 Repos nuevos
```
server/db/repos/mgmtIpRepo.js   → getMgmtIpForUser(ws, user_id)
server/db/repos/sessionRepo.js  → create/getActiveByUser/getActiveByTunnel/close/listForWs
```

### 4.2 `POST /api/tunnel/activate` — reescritura ([core.routes.js:140](server/routes/core.routes.js))
Flujo con validaciones y puntos de fallo contenidos:
```
PRE  req.mikrotik existe?            no → 503 (router sin configurar)
 1   user_id = req.account.sub       (identidad real, no del body)
 2   mgmt_ip = mgmtIpRepo.get(ws,user_id)
        no existe → 409 "Registra tu WireGuard de gestión"   [CONTENER]
 3   permiso sobre VRF:
        OWNER/CO_MOD → nodeBelongsToRequester(req, ppp_user)  (node.routes.js:54)
        MEMBER       → assignmentRepo.assignedTunnelIds incluye tunnel  (node.routes.js:40)
        falla → 403                                            [CONTENER]
 4   targetVRF existe en MikroTik?  (validar contra /ip/vrf/print cacheado)
        no → 400 "VRF inexistente"                             [CONTENER]
 5   sesión previa del MISMO usuario:
        existe → remover SU mangle (mangle_id) + close()       (switch de túnel)
 6   MikroTik (conexión limpia, patrón 2-fases del código actual):
        a) remove [comment=ACCESO-USER-<id8>]   (idempotente)
        b) add mangle src=mgmt_ip → targetVRF   → capturar .id
        si (b) falla → NO persistir sesión; intentar remove de (a); 500 [ROLLBACK]
 7   sessionRepo.create({user_id, tunnel_id, mgmt_ip, mangle_id, status:ACTIVE})
 8   tunnel_session_logs(ACTIVATE)   (auditoría)
 9   SSE → emitToUser(user_id)        (NO broadcast global)
10   200 { vrf, mgmt_ip, expiry }
```
**Quitar:** `setAppSetting('active_vrf')` global + `broadcastTunnelEvent` a todos.

### 4.3 `POST /api/tunnel/deactivate` ([core.routes.js:213](server/routes/core.routes.js))
```
1 session = sessionRepo.getActiveByUser(ws, sub)   no → 404
2 MikroTik: remove [comment=ACCESO-USER-<id8>]      (idempotente, ignora "no encontrado")
3 sessionRepo.close(id) ; log(DEACTIVATE) ; SSE al user ; 200
```
> `cleanTunnelRules` global ([routeros.service.js:82](server/routeros.service.js)) deja de usarse en
> el flujo normal (queda solo para `/tunnel/repair` admin).

### 4.4 `GET /api/tunnel/status` — por usuario ([core.routes.js:291](server/routes/core.routes.js))
Devuelve **solo** la sesión de `req.account.sub` (o `null`).

### 4.5 SSE `GET /api/tunnel/events` ([core.routes.js:280](server/routes/core.routes.js))
Mapa `user_id → Set<res>`; `emitToUser()`. Admin puede suscribirse a todos.

### 4.6 `POST /api/nodes` — flags por usuario ([node.routes.js:75](server/routes/node.routes.js))
```js
node.running_by_you  = sessionRepo.getActiveByUser(ws, sub)?.tunnel_id === node.nombre_vrf
node.active_by_other = isAdmin ? sessionRepo.getActiveByTunnel(ws, node.nombre_vrf) : null
```
> No-admin: NO revela que otro lo usa (privacidad). Admin: sí.

### 4.7 `/tunnel/keepalive` ([core.routes.js:233](server/routes/core.routes.js))
Recrea la mangle **del usuario** (`ACCESO-USER-<id8>` con su `mgmt_ip`), no la global.

### 4.8 Escaneo / acceso a equipos
El escaneo rutea por el VRF activo. Atar el escaneo al `mgmt_ip` del solicitante para que
A no escanee la LAN de B (revisar `device.routes.js` y `node.routes.js` scan-stream).

### 4.9 Reglas de robustez del backend (ya en tu base de código — mantener)
- Patrón 2-conexiones (cleanup vs add) para node-routeros ([core.routes.js:146-188](server/routes/core.routes.js)).
- `writeIdempotent` ignora duplicados ([routeros.service.js:101](server/routeros.service.js)).
- Cerrar `api` en todo `catch`.
- Reintento MySQL al boot ([index.js:121](server/index.js)).

---

## 5. (OPCIONAL) Firewall por usuario — defensa en profundidad

Solo si quieres aislamiento también a nivel firewall (no solo ruteo). **Riesgo medio**
porque toca reglas que hoy funcionan.

### 5.1 address-list por nodo (al provisionar)
```rsc
/ip firewall address-list add list=LIST-NET-ND1-ONLY address=10.1.1.0/24
/ip firewall address-list add list=LIST-NET-ND4-ONLY address=142.152.7.0/24
```
### 5.2 Reemplazar la regla genérica por reglas por-IP
```rsc
# Antes (genérica, rsc:235): src-list=vpn-activa → dst-list=LIST-NET-REMOTE-TOWERS
# Después: una por usuario activo
/ip firewall filter add chain=forward src-address=192.168.21.20 \
   dst-address-list=LIST-NET-ND1-ONLY action=accept comment="FW-USER-<id8>" \
   place-before=[find comment="AISLAMIENTO NODO-NODO"]
```
### 5.3 Acotar "Admin MGMT libre" (rsc:241)
Esta regla deja pasar todo lo de `VPN-WG-MGMT`. Para que el firewall aísle de verdad,
restringirla a tráfico de gestión legítimo (Winbox/API/handshakes) y dejar el acceso a
LANs remotas exclusivamente a las reglas `FW-USER-*`.
> ⚠️ Hacer esto en ventana de mantenimiento con consola Winbox abierta (por si se corta).

---

## 6. SECUENCIA DE DESPLIEGUE (reversible, con validación por paso)

```
PASO 1  BD: crear user_mgmt_ips + tunnel_user_sessions + logs
        VALIDAR: tablas existen, FKs OK.                      Rollback: DROP TABLE.
PASO 2  BD: poblar user_mgmt_ips (member_wg + backfill peers)
        VALIDAR: cada usuario activo tiene 1 mgmt_ip único.   Rollback: TRUNCATE.
PASO 3  Backend: desplegar repos + endpoints en "doble escritura"
        (escribe sesión por-usuario Y mantiene app_settings legacy)
        VALIDAR: activar como 1 usuario → sesión creada + mangle por-IP OK.
        Rollback: revertir binario; legacy sigue vivo.
PASO 4  Frontend: UI por-usuario detrás de flag (canary con fernando)
        VALIDAR: fernando ve solo su túnel; activar/desactivar OK.
PASO 5  MikroTik: backup → remover mangle global → activar 2 usuarios reales
        VALIDAR: matriz de pruebas (sección 7).                Rollback: importar backup.
PASO 6  (opcional) Firewall por-usuario (Fase 5) en ventana mantenimiento.
PASO 7  Limpieza: quitar app_settings.active_vrf y broadcast global.
```
> El **único corte de red** es el PASO 5. Todo lo previo es aditivo y reversible.

---

## 7. MATRIZ DE PRUEBAS (con TUS nodos reales)

```
[ ] A(.20)→ND1 y B(.51)→ND4 simultáneos: ambos navegan su LAN
[ ] A NO alcanza 142.152.7.0/24 (LAN de ND4 de B)  → ping/scan falla
[ ] B NO alcanza 10.1.1.0/24 (LAN de ND1 de A)     → ping/scan falla
[ ] LAN duplicada: A→ND5(192.168.8.0/24) y B→ND13(192.168.8.0/24) coexisten sin choque
[ ] A cambia ND1→ND5: su mangle ND1 se borra, la de B intacta
[ ] A no puede desactivar la sesión de B (404)
[ ] No-admin: A no ve que B tiene ND4 activo. Admin: ve ambos
[ ] Logout de A → su mangle ACCESO-USER-<A> desaparece del router
[ ] Expiración 30min → mangle del usuario eliminada
[ ] Anti-spoof: A manda body con IP .51 → backend ignora, usa .20 de user_mgmt_ips
[ ] Reboot RB750GL → ninguna sesión "fantasma"; reactivar funciona
[ ] MikroTik caído a media activación → no queda sesión ACTIVE huérfana en BD
```

---

## 8. ESCENARIOS DE FALLO Y CONTENCIÓN

| Escenario | Detección | Contención |
|-----------|-----------|------------|
| Usuario sin `mgmt_ip` | Fase activate paso 2 | 409, no se toca MikroTik |
| VRF inexistente / mal escrito | paso 4 valida contra `/ip/vrf/print` | 400, abortar |
| `add` mangle falla (timeout RouterOS) | try/catch paso 6b | remove parcial + 500, sin sesión persistida |
| Dos usuarios comparten IP | `uq_ip` en `user_mgmt_ips` lo impide | registro rechazado; exigir 1 peer/usuario |
| Sesión huérfana (BD ACTIVE, sin mangle) | keepalive detecta ausencia | recrea mangle o cierra sesión |
| RB750GL saturado (CPU/RAM) | monitor `/system/resource` | limitar nº de sesiones concurrentes (ej. ≤ 8) |
| MySQL caído | reintento boot ([index.js:121](server/index.js)) + health (db/mysql.js) | backend espera, no corrompe estado |
| Reboot router pierde mangle dinámicas | esperado por diseño | keepalive/reactivación las recrea |
| Regla "Admin MGMT libre" anula firewall | solo afecta Fase 5 | documentado; ruteo sigue aislando |

---

## 9. CONSIDERACIONES DE HARDWARE (RB750GL)

- 256 MB RAM, CPU 400-650 MHz: **no** usar `/print` con polling agresivo. Mantener el patrón
  secuencial actual y timeouts cortos.
- Cada usuario = 1 mangle (+ opcional 1-2 fw rules). Con ≤ 8 usuarios concurrentes el impacto
  es trivial. Documentar límite blando de **8 sesiones simultáneas**.
- Evitar `connection-tracking` extra; la marca de ruteo en prerouting es barata.
- No habilitar logging por-paquete en estas reglas (llena RAM).

---

## 10. ARCHIVOS A TOCAR (resumen)

| Capa | Archivo | Acción |
|------|---------|--------|
| BD | `sql/migration_001_*.sql` + nuevo `migration_002_user_mgmt_ips.sql` | crear tablas |
| BD | `db/repos/sessionRepo.js`, `db/repos/mgmtIpRepo.js` | nuevos |
| Backend | `routes/core.routes.js` | activate/deactivate/status/SSE/keepalive por-usuario |
| Backend | `routes/node.routes.js` | flags `running_by_you`; (opc) crear `LIST-NET-ND<n>-ONLY` |
| Backend | `routes/wireguard.routes.js` | escribir `user_mgmt_ips` al crear peer |
| Backend | `routes/device.routes.js` | escaneo atado al `mgmt_ip` del solicitante |
| Frontend | `context/hooks/useNodeManagement.ts` | eliminar `adminIP` hardcodeado |
| Frontend | `components/VPN/NodeCard/hooks/useNodeActivation.ts` | quitar deactivate global; payload `{targetVRF}` |
| Frontend | `context/hooks/useTunnelSync.ts` | status/SSE por-usuario |
| Frontend | `components/VPN/NodeCard/*` | UI `running_by_you` / "cambiar túnel" |
| MikroTik | config | quitar mangle global; mangle por-IP (backend); (opc) firewall por-IP |

---
**Fin del plan detallado** · Específico a RB750GL + tu topología (2026-06-06)
