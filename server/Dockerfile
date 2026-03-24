# ── Backend MikroTik VPN Manager ────────────────────────────────────────────
FROM node:22-alpine

# sqlite3 y ssh2 necesitan compilación nativa
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Instalar dependencias primero (aprovecha caché de Docker)
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar solo el código fuente (no node_modules, no .db_secret, no database.sqlite)
COPY *.js ./

# Directorio de datos persistente (montado como volumen en docker-compose)
RUN mkdir -p /data

EXPOSE 3001

CMD ["node", "index.js"]
