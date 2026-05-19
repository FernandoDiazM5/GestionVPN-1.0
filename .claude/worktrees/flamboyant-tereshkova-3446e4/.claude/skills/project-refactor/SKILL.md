---
name: project-refactor
description: Skill para refactorizar estructuralmente el proyecto MikroTik VPN Manager siguiendo el análisis de arquitectura avanzado. Úsala para implementar JWT, reemplazar JSON por columnas relacionales en DB, añadir colas asíncronas (BullMQ/Redis), y migrar a WireGuard. Actívala cada vez que se requiera evolucionar la arquitectura hacia la v2.0.
---

# Skill: Implementación de Mejoras Arquitectónicas (v2.0)

Esta skill define la hoja de ruta paso a paso («al pie de la letra») derivada del reporte de Análisis Profundo, redactado por los ingenieros DBA, de Software, de Redes y de Automatización.

Debes seguir esta guía estrictamente cuando estés refactorizando el proyecto. NUNCA pases a la siguiente fase sin que la anterior haya sido completamente testeada y aprobada por el usuario.

## Fase 1: Ingeniería de Software y Seguridad (Migración a JWT)
Actualmente, el Frontend confía en pasar la IP, Usuario y Password de MikroTik al Backend en cada petición. Esto es un riesgo.

**Pasos requeridos:**
1. Crear un nuevo endpoint de **Login** en Express (`api.routes.js: /api/auth/login`).
   - Este endpoint recibe las credenciales.
   - Valida contra el MikroTik usando `node-routeros`.
   - Si tiene éxito, el Backend genera un `JWT` (JSON Web Token) incluyendo el rol (ej. admin) y lo devuelve. NUNCA DEVOLVER CREDENCIALES AL FRONTEND.
2. Implementar un **Middleware de Autenticación** en Node.js que capture el JWT del Header `Authorization: Bearer <token>` para proteger todo `/api`.
3. Actualizar el **Frontend** (`VpnContext.tsx`, `db.ts`):
   - Al loguearse, guardar solo el JWT en IndexedDB.
   - Enviar el JWT en los interceptors/fetch requests.
4. **Validación de Payloads:** Integrar `Zod` u otra librería a nivel de middleware en el backend para sanear IPs, MACs, y subredes antes de tratarlos.

## Fase 2: Automatización y Procesos Pesados (Colas y SSE)
Las peticiones bloqueantes (escaneo concurrente SSH de docenas de antenas por HTTP) ralentizan Express.

**Pasos requeridos:**
1. Separar la lógica pesada (`probeUbiquiti` y escaneo) en **Workers** independientes de Node.js.
2. Agrupar peticiones masivas mediante una cola asíncrona (ej. **BullMQ** apoyado por un Redis en `docker-compose.yml`, o usar colas nativas simples si no hay Redis).
3. Implementar **Server-Sent Events (SSE)** o **WebSockets**.
   - El Frontend envía un comando de escaneo. El Backend acepta y devuelve un 202 Accepted.
   - El proceso de Worker corre, y envía el progreso (ej. "Escaneado 5/45 IPs...") vía SSE/WebSocket.
   - El UI (React) es reactivo sin timeouts bloqueantes.

## Fase 3: Base de Datos Relacional y Normalización
La base SQLite usa columnas `data TEXT` con blobs JSON inmensos (para `devices` y `nodes`).

**Pasos requeridos:**
1. **Normalizar Tablas:** En `db.service.js`, usar comandos `ALTER TABLE` o recrear tablas (`devices_v2`, `nodes_v2`) descomponiendo el payload JSON.
   - `nodes` debe tener columnas reales: `nombre_nodo`, `nombre_vrf`, `iface_name`, `segmento_lan`, `ip_tunnel`.
   - Eliminar el almacenamiento redundante de `data`.
2. Opcional (pero recomendado): Plantear a usuario transicionar `sqlite3` a **PostgreSQL** dentro de Docker, dado que Postgres maneja `JSONB` e indexado de forma infinita y segura.
3. Instalar/Integrar migraciones controladas (ej. `knex migrate` o `Umzug`).

## Fase 4: Redes (Adición de WireGuard para Migración Progresiva)
SSTP (sobre TCP) genera cuellos de botella ("TCP Meltdown"). Para solucionarlo, se implementará WireGuard de forma PARALELA a SSTP. No se debe eliminar o reemplazar la infraestructura SSTP existente de golpe.

**Pasos requeridos:**
1. Actualizar `routeros.service.js` y `api.routes.js` (`/node/provision`).
2. Mantener intacta la lógica de aprovisionamiento SSTP actual en MikroTik (`/ppp/secret`, `/interface/sstp-server`).
3. Añadir la capacidad de generar llaves públicas/privadas WireGuard y bloques `/interface/wireguard/peers` para los nodos que lo soliciten.
4. Asignar la interfaz VPN-WG de cliente específico al VRF correspondiente, de manera que el nodo pueda funcionar tanto con SSTP como con WireGuard simultáneamente o cambiar entre ellos.
5. UI Retro-compatible: Al aprovisionar o editar un nodo, permitir al usuario elegir el protocolo (SSTP o WireGuard). Esto permitirá realizar una migración progresiva nodo por nodo a voluntad del usuario.

---
**Instrucción Final para el Agente:** 
Usa las herramientas de `run_command` y edición masiva (`multi_replace_file_content`) progresivamente. Siempre muestra el `git diff` o pide revisión (`notify_user`) entre la ejecución de fases.
