# Agente de seguridad del VPS

Expone únicamente en `127.0.0.1:8788` operaciones tipadas sobre Fail2ban. No
acepta comandos shell enviados por el backend. Cada solicitud usa timestamp,
nonce y firma HMAC. El secreto vive fuera de Git y debe coincidir en el agente y
`server/.env.production`.

Instalación (requiere autorización separada de producción):

```bash
install -d -m 0755 /usr/local/lib/gestionvpn /etc/gestionvpn
install -m 0755 deploy/security-agent/security-agent.py /usr/local/lib/gestionvpn/
install -m 0644 deploy/security-agent/gestionvpn-security-agent.service /etc/systemd/system/
install -m 0600 deploy/security-agent/gestionvpn-manual-jails.conf /etc/fail2ban/jail.d/
install -m 0600 deploy/security-agent/gestionvpn-web-jails.conf /etc/fail2ban/jail.d/
install -m 0644 deploy/security-agent/gestionvpn-sshd-recidive.conf /etc/fail2ban/filter.d/
install -m 0600 deploy/security-agent/gestionvpn-recidive.conf /etc/fail2ban/jail.d/
openssl rand -hex 32 > /etc/gestionvpn/security-agent.secret
chmod 600 /etc/gestionvpn/security-agent.secret
# Crear /etc/gestionvpn/security-agent.env con SECURITY_AGENT_SECRET y
# SECURITY_AGENT_PROTECTED_IPS (IP pública VPS y otras direcciones críticas).
# Copiar el mismo secreto a SECURITY_AGENT_SECRET en server/.env.production;
# nunca guardar el valor real en Git.
fail2ban-client reload
systemctl daemon-reload
systemctl enable --now gestionvpn-security-agent
```

Nunca probar un bloqueo inicialmente con la IP de la sesión SSH administrativa.
La confianza administrada se escribe en `zz-gestionvpn-trusted.local` para que
se cargue después de cualquier `ignoreip` específico ya existente.

La protección web temporal requiere dos controles simultáneos en el backend:
`WEB_SECURITY_MODE=enforce_temp` y
`WEB_SECURITY_ENFORCEMENT_CONFIRM=ENABLE_TEMP_WEB_BANS`. Sin ambos permanece en
`OBSERVE_ONLY`. El agente acepta para automatización exclusivamente `web_ban`
hacia los jails fijos `gestionvpn-web-rate`, `gestionvpn-web-scan`,
`gestionvpn-web-scan-24h` y `gestionvpn-web-sensitive`; las escaladas usan
`gestionvpn-web-auth` o `gestionvpn-web-recidive`. Siempre vuelve a comprobar IPs críticas, direcciones
confiables y sesiones administrativas activas.

Todos estos jails usan la acción `ufw`: el bloqueo se aplica por dirección de
origen a nivel del VPS y alcanza todos los puertos públicos expuestos, incluidos
SSH (22), HTTP (80) y HTTPS (443). No se limita a la ruta web que originó el
incidente.

La escalada indefinida requiere además
`WEB_SECURITY_INDEFINITE_CONFIRM=ENABLE_INDEFINITE_WEB_BANS`. Con esta tercera
confirmación, diez fallos distribuidos entre varias identidades en 24 horas o
el tercer bloqueo web temporal de una IP dentro de 7 días se aplican mediante
`web_ban_indefinite` en el jail tipado correspondiente. El desbloqueo administrativo
existente sigue disponible y la operación vuelve a validar todas las exclusiones.
Los escaneos claros usan una progresión específica de 6 horas, 24 horas y,
en el tercer episodio dentro de 7 días, bloqueo indefinido.

Incluso con los interruptores confirmados, `WEB_SECURITY_ROLLOUT_PERCENT` debe
estar entre 1 y 100 para aplicar acciones. `0`, un valor inválido o `observe`
son un kill switch efectivo. La selección es determinista por IP: una misma
dirección permanece dentro o fuera del canary al reiniciar. El avance recomendado
es 10 → 25 → 50 → 100, revisando fallos, falsos positivos y desbloqueos entre pasos.
Cada acción aplicada o fallida se notifica una vez a los administradores activos
que tengan Telegram enlazado y notificaciones sin pausar.
