# Runbook — protección web gradual

Este procedimiento se ejecuta únicamente con autorización explícita. La fuente
de verdad de producción es `docker-compose.prod.yml`; no usar el compose de
desarrollo. No contiene secretos ni valores reales.

## 1. Condiciones previas

1. Confirmar dos accesos SSH por llave y `sudo -n true`.
2. Verificar HTTPS, `/api/health`, MariaDB, Docker, Fail2ban, UFW y espacio libre.
3. Crear un dump comprimido, verificarlo y restaurarlo en una MariaDB temporal.
4. Registrar commit, IDs de imágenes, conteos críticos y reinicios de contenedores.
5. Respaldar configuración del agente y `/etc/fail2ban/jail.d/`.
6. Confirmar al menos un administrador con Telegram enlazado y sin pausar.

## 2. Instalación en modo seguro

1. Avanzar el checkout al commit aprobado.
2. Instalar el agente y `gestionvpn-web-jails.conf` según
   `deploy/security-agent/README.md`.
3. Validar configuración Fail2ban antes de recargarla.
4. Mantener inicialmente:

```dotenv
WEB_SECURITY_MODE=observe
WEB_SECURITY_ENFORCEMENT_CONFIRM=
WEB_SECURITY_INDEFINITE_CONFIRM=
WEB_SECURITY_ROLLOUT_PERCENT=0
```

5. Construir exclusivamente con:

```text
docker compose -f docker-compose.prod.yml up -d --build
```

6. Confirmar migraciones, health, HTTPS, Nginx, agente, jails y cero reinicios.

## 3. Canary reversible

Cada cambio de variables requiere recrear únicamente el backend con el compose
de producción y repetir los controles de salud.

| Paso | Modo | Rollout | Indefinido | Permanencia mínima |
|---|---|---:|---|---:|
| Observación | `observe` | 0% | No | 24 h |
| Armado | `enforce_temp` + confirmación temporal | 0% | No | 30 min |
| Canary 1 | Igual | 10% | No | 24 h |
| Canary 2 | Igual | 25% | No | 24 h |
| Canary 3 | Igual | 50% | No | 48 h |
| Temporal completo | Igual | 100% | No | 72 h |
| Indefinido | Añadir confirmación indefinida | 100% | Sí | Supervisión diaria 7 d |

La selección del porcentaje es determinista por IP; reiniciar no cambia la
cohorte. Las IP fuera del canary siguen observándose, pero no se bloquean.

En cada paso revisar:

- acciones `APPLIED`, `FAILED` y `PENDING` en Administración;
- desbloqueos y falsos positivos;
- IP/CIDR confiables y dirección del administrador activo;
- mensajes Telegram aplicados y fallidos;
- latencia, errores 5xx/429 y salud del backend;
- estado y expiración real de los jails.

## 4. Criterios de aborto

Volver inmediatamente a observación si ocurre cualquiera:

- una IP administrativa o confiable aparece bloqueada;
- un usuario legítimo queda afectado por un bloqueo global;
- hay acciones repetidas durante el mismo episodio;
- el agente, Fail2ban, Nginx o backend entra en error/reinicio;
- la tasa de fallos automáticos es distinta de cero sin causa conocida;
- Telegram o el panel no permiten reconstruir qué ocurrió.

Kill switch:

```dotenv
WEB_SECURITY_MODE=observe
WEB_SECURITY_ROLLOUT_PERCENT=0
```

Después, recrear sólo backend con `docker-compose.prod.yml`, confirmar que el
estado del panel sea `Preparado · desactivado` y desbloquear manualmente los
falsos positivos. Cambiar el modo no retira bans ya existentes.

## 5. Rollback de código

1. Mantener el kill switch en observación.
2. Volver al commit e imágenes respaldadas.
3. Restaurar agente/jails respaldados y validar Fail2ban antes de recargar.
4. Reconstruir sólo los servicios afectados con el compose de producción.
5. No revertir las tablas aditivas salvo corrupción demostrada; el código viejo
   puede ignorarlas. Restaurar la base únicamente con autorización y después de
   comparar conteos críticos.
6. Validar HTTPS, health, Nginx, agente, Fail2ban, UFW, contenedores y datos.

## 6. Evidencia de cierre

Guardar sin secretos: commit, hora, dump/checksum, imágenes de rollback,
variables sólo como estado (no secretos), resultados por paso, acciones del
canary, falsos positivos, mensajes Telegram, health y decisión de avanzar o
abortar.
