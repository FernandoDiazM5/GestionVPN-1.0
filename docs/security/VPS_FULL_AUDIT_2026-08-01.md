# Auditoría integral posterior al despliegue al 100%

Fecha: 2026-08-01 (America/Lima)  
Producción: `ae5fe5e` (código funcional `d25dca4`)  
Dominio: `joinpoint.cloud`

## Dictamen ejecutivo

**Operación aprobada con observaciones.** Backend, frontend, MariaDB, Docker,
Nginx, TLS, WireGuard, SSH, Fail2ban, UFW y el agente de seguridad están
operativos. La protección web quedó activa al 100%, con bloqueos temporales e
indefinidos habilitados. El primer ataque observado fue bloqueado, auditado y
reflejado en UFW correctamente.

No se detectó pérdida de datos, reinicios de contenedores, unidades fallidas ni
errores activos de aplicación. El pendiente funcional principal es enlazar
Telegram con una cuenta `platform_admin`: existe un usuario enlazado, pero no es
administrador de plataforma y por ello las alertas automáticas de seguridad no
tienen destinatario.

## Despliegue y rollback

- Checkout del VPS: `ae5fe5e`, sincronizado con `origin/vps_prod`.
- Imágenes ejecutadas: backend `b9c0662a5630`, frontend `b2d05c0dab40`.
- Respaldo root-only: `/root/pre-phase9-20260801T191019Z`.
- Dump SHA-256: `365b4d98550abdcbc56a97d90c7be6247dbe782cf51ea247739cb06d7334fd42`.
- El dump se restauró en MariaDB aislada y reprodujo 50 tablas, 5 usuarios,
  3 workspaces y 14 nodos.
- Rollback conservado: `gestionvpn-10-{backend,frontend}:pre-phase9-20260801T191019Z`.
- Copia del entorno anterior al 100%: `env.observe-before-100`, modo 600.
- Kill switch disponible: `observe` + rollout `0%` y recreación sólo del backend.

## Backend y datos

- Backend `healthy`, 0 reinicios, consumo aproximado 65 MiB.
- Health: MySQL y SMTP `ok`; RouterOS alterna `ok/stale` según el tiempo desde
  la última escritura, mientras WireGuard conserva handshake reciente.
- 54 tablas después de las migraciones; 5 usuarios, 3 workspaces y 14 nodos
  preservados; 0 túneles activos durante el cambio.
- 102 archivos / 612 pruebas backend aprobadas.
- Inventario de rutas, sintaxis y validaciones completas aprobadas.
- El endpoint administrativo anónimo responde 401.
- No hay errores `fatal`, excepciones no controladas ni migraciones fallidas.

## Frontend y borde web

- Frontend activo, 0 reinicios, Nginx válido y consumo aproximado 9 MiB.
- Raíz, health y ruta histórica responden 200; `www` redirige al dominio raíz.
- 64 archivos / 216 pruebas frontend aprobadas; TypeScript y ESLint sin fallos.
- Desde Internet sólo responden TCP 22, 80 y 443; 3001, 3307 y 8788 no son
  accesibles públicamente.
- HSTS, `X-Frame-Options` y `X-Content-Type-Options` presentes.
- El HTML público no entrega actualmente `Content-Security-Policy` ni
  `Referrer-Policy`; Helmet sí los aplica en el backend/API.
- Auditoría del sistema de diseño: 6 observaciones preexistentes (1 error de
  paleta, 4 warnings de tamaño/dark mode y 1 info por las pestañas de Seguridad),
  sin defecto funcional demostrado.

## Seguridad del VPS

- SSH: sólo `vpsadmin`, clave pública, root y contraseñas deshabilitados,
  3 intentos máximos y 30 s de gracia.
- UFW activo: 22 limitado, 80/443 permitidos, 3001 denegado públicamente.
- Fail2ban activo con 15 jails. Fail2ban y UFW quedaron reconciliados.
- Agente activo únicamente en `127.0.0.1:8788`; backend→agente por HMAC correcto.
- Lista confiable: `179.6.169.75/32`; protecciones anti-autobloqueo activas.
- WireGuard activo: ruta al Core por `wg0`, handshake y transferencia recientes;
  la clave privada no se expuso en la auditoría.
- Certificado Let's Encrypt válido para `joinpoint.cloud`, `www` y nip.io hasta
  2026-10-28.
- No hay unidades systemd fallidas ni reinicio pendiente.

## Protección web al 100%

- Estado efectivo: `enforce_temp`, confirmación temporal activa, rollout 100%
  y confirmación indefinida activa.
- El escáner `216.144.249.201` solicitó `/.env`, `/.git/*` y rutas equivalentes.
- Resultado: `APPLIED`, jail `gestionvpn-web-sensitive`, expiración 1 hora y
  regla global UFW efectiva.
- La acción quedó en `web_security_actions`; la evidencia resumida permanece en
  `web_security_events`, sin payloads, credenciales ni tokens.
- Hay 0 cuentas bloqueadas al cierre.
- Telegram bot está activo, pero hay **0 administradores de plataforma** con
  Telegram enlazado; la alerta del primer bloqueo no tuvo destinatario.

## Verificación de código y dependencias

- Backend: 612/612 pruebas.
- Frontend: 216/216 pruebas.
- Agente Python: 6/6 pruebas y compilación correcta.
- `check:all`, inventario de rutas, TypeScript, ESLint y `git diff --check`: OK.
- `npm audit --omit=dev`: 11 avisos (3 altos, 7 moderados y 1 bajo). Incluyen
  `body-parser`, `brace-expansion`, `react-router` y `uuid`. El aviso de
  React Router afecta RSC/server actions y esta aplicación es una SPA Vite; las
  actualizaciones que implican cambios mayores deben planificarse y probarse,
  no aplicarse con `--force` directamente en producción.
- Semgrep 1.166.0: **inconcluso por timeout del motor**. El escaneo completo
  excedió 4 minutos y el alcance reducido a código ejecutable excedió 20 minutos;
  ambos contenedores temporales fueron detenidos. No se interpreta como
  “sin hallazgos” ni como un fallo de la aplicación. Las reglas locales, pruebas,
  lint, tipos e inventario de rutas sí completaron.

## Comparación con el handoff

| Requisito vigente | Evidencia en producción | Estado |
|---|---|---|
| 54 tablas y datos preservados | 54 / 5 usuarios / 3 workspaces / 14 nodos | Cumplido |
| Seguridad separada por vector | 15 jails, incluidos auth/rate/scan/sensitive/recidive | Cumplido |
| Bloqueo global UFW | ataque real presente en jail y UFW | Cumplido |
| Rollout 100% temporal | estado efectivo confirmado por backend | Cumplido |
| Reincidencia indefinida | confirmación efectiva activa | Cumplido |
| Anti-autobloqueo y confianza | agente HMAC + confianza `/32` | Cumplido |
| Auditoría de acciones/evidencia | evento y acción `APPLIED` persistidos | Cumplido |
| Roles admin/moderador | 27 pruebas focalizadas + rutas inventariadas | Cumplido técnico |
| Telegram a administradores | 0 `platform_admin` enlazados | **Pendiente** |
| Validación humana de UI autenticada | no realizada en esta auditoría técnica | Pendiente humano |

## Hallazgos y prioridades

1. **P1 — Telegram administrativo:** enlazar una cuenta `platform_admin` y
   provocar una notificación controlada; actualmente el bloqueo funciona pero
   no avisa a un administrador.
2. **P1 — Dependencias:** preparar una actualización probada para los 3 avisos
   altos de `npm audit`; no usar `npm audit fix --force` sin una rama y regresión.
3. **P2 — Cabeceras del shell:** evaluar CSP compatible con Firebase/Google y
   añadir `Referrer-Policy` en Nginx.
4. **P2 — Memoria:** el VPS tiene 1.9 GiB y no tiene swap; configurar una swap
   pequeña en una ventana separada reduciría riesgo de OOM durante builds.
5. **P3 — Mantenimiento:** hay 3 paquetes APT pendientes, sin reinicio requerido;
   instalarlos en otra ventana para no mezclar rollback.
6. **P3 — Diseño:** corregir las 6 observaciones de consistencia visual en una
   tarea separada.
7. **P3 — Semgrep:** diagnosticar el timeout del motor o dividir el escaneo por
   módulo en CI; hasta entonces el resultado estático de Semgrep es inconcluso.

## Conclusión

La aplicación y la protección al 100% funcionan conforme al diseño y ya
detuvieron un ataque real. El sistema no puede considerarse cerrado al 100% en
operación hasta enlazar Telegram con un administrador de plataforma y completar
una prueba humana autenticada del panel. Los demás hallazgos son mejoras de
endurecimiento o mantenimiento y no invalidan el despliegue actual.
