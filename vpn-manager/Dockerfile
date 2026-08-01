# ── Stage 1: Build React ────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# ARG disponible en tiempo de build para Vite
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_FEDERATED_AUTH_ENABLED="false"
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_FIREBASE_TENANT_ID=""
ENV VITE_FEDERATED_AUTH_ENABLED=${VITE_FEDERATED_AUTH_ENABLED} \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID} \
    VITE_FIREBASE_TENANT_ID=${VITE_FIREBASE_TENANT_ID}

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY server/package.json server/package.json
COPY vpn-manager/package.json vpn-manager/package.json
RUN npm ci --workspace=@gestionvpn/contracts --workspace=vpn-manager --include-workspace-root

COPY packages/contracts packages/contracts
COPY vpn-manager vpn-manager
RUN npm run build:contracts && npm run build --workspace=vpn-manager

# ── Stage 2: Servir con nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Copiar el build de Vite
COPY --from=builder /app/vpn-manager/dist /usr/share/nginx/html/GestionVPN-1.0

# Configuración de nginx (proxy /api → backend, SPA fallback)
COPY vpn-manager/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
