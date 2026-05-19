---
name: product-evolution
description: >
  Skill para análisis de mejoras, roadmap de producto y diseño de nuevas features
  para el MikroTik VPN Manager. Cubre automatizaciones, diagnóstico con IA,
  herramientas de red (ping, speed test, traceroute), mejoras multi-usuario,
  alertas, reportes, y cualquier evolución funcional del software.
---

# Product Evolution — MikroTik VPN Manager

## Cuándo usar
- El usuario pregunta qué mejorar, qué falta, o quiere planificar features
- Se necesita diseñar una nueva funcionalidad end-to-end
- Se quiere evaluar viabilidad técnica de una mejora

## Stack actual
- **Backend:** Node.js + Express, RouterOS API (node-routeros), SSH2 (ssh2), SQLite (sqlite3)
- **Frontend:** React 19 + TypeScript + Tailwind CSS + Lucide icons
- **Auth:** JWT + bcrypt + RBAC (admin/operator/viewer)
- **Monitoreo:** Polling SSH a Ubiquiti airOS (mca-status, wstalist, status.cgi)
- **VPN:** SSTP + WireGuard sobre MikroTik RouterOS
- **DB:** SQLite con WAL mode, AES-256-GCM para credenciales

## Áreas de mejora conocidas
1. **Automatizaciones** — provisión, monitoreo, alertas, mantenimiento
2. **Diagnóstico** — ping, traceroute, speed test, análisis de señal
3. **IA** — análisis predictivo, diagnóstico automático, recomendaciones
4. **Multi-usuario** — auditoría, notificaciones, permisos granulares
5. **Reportes** — SLA, uptime, rendimiento, historial
6. **Integración** — Telegram/WhatsApp bots, webhooks, API pública

## Proceso de análisis
1. Explorar código actual para entender qué existe
2. Identificar gaps funcionales vs herramientas ISP profesionales
3. Proponer features priorizadas por impacto/esfuerzo
4. Diseñar arquitectura de cada feature (backend + frontend + DB)
5. Generar roadmap con fases incrementales
