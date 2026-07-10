---
name: project-dead-animate-in
description: tailwindcss-animate NO esta instalado — las clases animate-in/fade-in/zoom-in-95/slide-in-from-* no generan CSS; usar keyframes propios de index.css
metadata:
  type: project
---

`tailwindcss-animate` NO figura en `vpn-manager/package.json` y `tailwind.config.js` tiene `plugins: []`. Por lo tanto TODAS las clases `animate-in`, `fade-in`, `zoom-in-95`, `slide-in-from-*` y `duration-400` (no existe en la escala v3) son clases muertas: no generan CSS y el elemento aparece sin animacion.

**Why:** Detectado en auditoria visual 2026-07-04. Hay 15+ call-sites afectados (toasts de NodeAccessPanel/UserManagementPanel, Sidebar movil, ConfirmModal, App.tsx main, RouterMaintenanceOverlay, ProvisionSteps, DeepLinkBanner, NodeCardWgPeerForm, ScanProgressBanner). index.css ya reemplazo el patron con keyframes propios (`modal-fade-in`, `modal-zoom-in`, `reveal-up`) porque las utilities del plugin tampoco funcionan en `@apply`.

**How to apply:** En codigo nuevo NUNCA usar `animate-in ...`; usar `.modal-overlay`/`.modal-panel` (ya animan), `.reveal-stagger`, o definir keyframes en index.css con su bloque `prefers-reduced-motion`. Si algun dia se instala el plugin, borrar esta memoria. Nota relacionada: `src/styles/animations.css` es 100% codigo muerto (ninguna clase usada) con paleta gray cruda.
