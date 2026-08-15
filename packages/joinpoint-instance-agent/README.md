# Joinpoint Instance Agent

Agente local para cada VPS de cliente. Firma heartbeats con la identidad Ed25519 de la instancia, verifica paquetes de confianza y licencias de la Plataforma Central y persiste un único `agent-state.json` mediante reemplazo atómico.

## Configuración

- `JOINPOINT_INSTANCE_ID`
- `JOINPOINT_CENTRAL_URL` (HTTPS obligatorio)
- `JOINPOINT_INSTANCE_PRIVATE_KEY_FILE` (PEM Ed25519 externo, permiso `0600`)
- `JOINPOINT_AGENT_STATE_DIRECTORY` (recomendado `/var/lib/joinpoint-agent`)
- `JOINPOINT_SOFTWARE_VERSION`
- `JOINPOINT_SYNC_INTERVAL_SECONDS` (60–3600; default 300)

El instalador oficial debe llamar `InstanceAgent.bootstrap()` una única vez con la respuesta verificada de activación y después ejecutar `npm start --workspace=@joinpoint/instance-agent` como servicio no-root. El estado se guarda con permiso `0600`; la clave privada nunca se copia dentro del estado.

El heartbeat usa retroceso exponencial con jitter cuando la Central no responde. Durante una caída se reevalúa localmente la licencia y puede entrar en `OFFLINE_GRACE`. `capabilities.networkContinuity` siempre es `true`: este paquete no importa librerías de WireGuard/MikroTik, no ejecuta comandos del sistema y no desmonta túneles por pago, suspensión, revocación o pérdida de conectividad central.
