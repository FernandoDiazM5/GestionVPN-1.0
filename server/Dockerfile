# ── Backend MikroTik VPN Manager ────────────────────────────────────────────
FROM node:22-alpine

# sqlite3 y ssh2 necesitan compilación nativa
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Instalar dependencias primero (aprovecha caché de Docker)
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar TODO el código fuente (archivos .js raíz + subdirectorios routes/)
COPY *.js ./
COPY *.sql ./
COPY routes/ ./routes/

# Directorio de datos persistente (montado como volumen en docker-compose) +
# usuario no-root (B1). node:22-alpine trae el usuario `node` (uid 1000); el
# backend escucha en :3001 (>1024) → no requiere privilegios. Espeja el patrón
# ya probado en Dockerfile.prod.
RUN mkdir -p /data /app/uploads \
 && chown -R node:node /data /app
USER node

EXPOSE 3001

CMD ["node", "index.js"]
