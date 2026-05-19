---
name: docker-compose
description: Use this skill whenever the user mentions Docker, docker-compose.yml, Dockerfile, containers, containerization, or wants to run their app in Docker. Also trigger for questions about networking between containers, environment variables in Docker, port mapping, volumes, health checks, multi-service setups, or deployment with containers. If the user has any Docker files or asks how to containerize their project, use this skill immediately.
---

# Docker Compose & Containerización

## Contexto: Este Proyecto

**MikroTik VPN Manager** — dos servicios:
- **Frontend**: React 19 + TypeScript + Vite — static files servidos por nginx
- **Backend**: Node.js + Express — SQLite, conexiones SSH (ssh2), RouterOS API (port 8728)

Restricciones clave:
- El frontend llama a `localhost:3001` (hardcodeado en `vpn-manager/src/config.ts`) — en Docker esto ROMPE; resolver con nginx proxy o variable de entorno en build
- El backend conecta a dispositivos MikroTik (8728) y Ubiquiti via SSH — el contenedor necesita acceso a la red LAN
- SQLite (`server/database.sqlite`) debe persistirse con un volume
- SSH usa algoritmos legacy (diffie-hellman-group14/1, aes128-cbc) — no requiere config Docker especial

## Workflow

1. **Leer primero** — siempre leer `docker-compose.yml`, `Dockerfile`, `nginx.conf` antes de modificar
2. **Identificar el problema exacto** — networking, build, env vars, volumes, health check
3. **Fix mínimo** — no reestructurar lo que ya funciona

## Patrones

### Backend Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
```

### Frontend Dockerfile (Vite + nginx)
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### El problema del API URL en el frontend
El browser resuelve `localhost:3001` contra la máquina del usuario, NO contra el contenedor backend. Solución recomendada — nginx proxy:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### docker-compose.yml
```yaml
services:
  backend:
    build: ./server
    ports:
      - "3001:3001"
    volumes:
      - ./server/database.sqlite:/app/database.sqlite
      - ./server/.db_secret:/app/.db_secret
    env_file: .env
    restart: unless-stopped

  frontend:
    build: ./vpn-manager
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
```

## Networking

- **Bridge (default)**: Backend puede alcanzar IPs LAN vía host gateway. Suficiente para MikroTik/Ubiquiti en IPs fijas.
- **`network_mode: host`**: Acceso directo a LAN. Más fácil pero sin aislamiento. Útil si hay muchos dispositivos en rangos variados.
- En Windows Docker Desktop el host es `host.docker.internal`.

## Volúmenes — Persistencia

**CRÍTICO**: persistir estos dos archivos:
```yaml
volumes:
  - ./server/database.sqlite:/app/database.sqlite  # datos de nodos y dispositivos
  - ./server/.db_secret:/app/.db_secret            # clave AES-256 de cifrado — si se pierde, los datos cifrados son irrecuperables
```

## Variables de Entorno

```env
# .env (no commitear)
NODE_ENV=production
DATA_DIR=/app          # donde están database.sqlite y .db_secret
PORT=3001
```

```yaml
env_file:
  - .env
```

## Troubleshooting

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Frontend no llega al backend | localhost:3001 no resuelve | Agregar nginx proxy `/api/` |
| `npm ci` falla en build | package-lock.json faltante | Asegurar que esté commiteado y NO en `.dockerignore` |
| SQLite locked | Múltiples instancias escribiendo | No escalar el backend horizontalmente |
| No conecta a MikroTik | Routing de red | Verificar con `docker exec <container> ping <ip>` |
| Puerto en uso | Otro proceso usa el puerto | `netstat -ano | findstr :3001` en Windows |
