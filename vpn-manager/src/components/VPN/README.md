# VPN Components

Gestión y control de tuneles VPN (SSTP, WireGuard, PTP).

## Contenido

- **NodeCard.tsx** (800 líneas) - Tarjeta de nodo VPN individual
- **VpnCard.tsx** (290 líneas) - Tarjeta de tunel VPN
- **NodeProvisionForm.tsx** (393 líneas) - Formulario de aprovisionamiento

## NodeCard.tsx - Detalles

Componente más grande del proyecto. Responsabilidades:
- Renderizar información del nodo (nombre, IP, estado)
- Expandir/contraer detalles
- Botones de acción (activar, editar, eliminar)
- Integración con modales de configuración
- Sincronización con VpnContext

⚠️ **Nota:** Si NodeCard.tsx excede 1000 líneas, considerar refactorización en:
- NodeCardHeader
- NodeCardBody
- NodeCardActions
- useNodeCard hook (lógica)

Ver: MAINTENANCE_AND_REORGANIZATION_GUIDE.md

## APIs Utilizadas

- `GET /api/node/{id}`
- `POST /api/node/{id}/activate`
- `DELETE /api/node/{id}`
- `PUT /api/node/{id}`

**Última actualización:** 2026-05-29
