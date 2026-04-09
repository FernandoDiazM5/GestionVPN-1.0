---
name: NodeAccessPanel — VPS admin card y mangle-access
description: Contexto backend/frontend del card VPS principal en NodeAccessPanel, criterios de estado y defensas del endpoint mangle-access
type: project
---

## NodeAccessPanel — Card VPS principal (refactor 2026-04-08)

Card display-only en la parte superior de NodeAccessPanel que muestra el estado del VPS administrador, con pill semántica de estado operacional.

### Decisiones de UI validadas
- **Icono `Server`** (no `ShieldCheck` — ya se usa para "Túnel activo", generaría confusión visual).
- **Pill semántica** con 3 estados textuales: "Enrutando" / "En espera" / "Sin conexión" (más claro que un dot pasivo — el operador lee el estado sin interpretar colores).
- **Fallback con `AlertCircle` ámbar** cuando el VPS no está en `wgPeers` (edge case productivo).
- **Dot blanco sobre fondo de color** cuando el card está seleccionado (mejor contraste que mantener el mismo color).
- **Badge "Activo/Inactivo" inline en el estado colapsado** — sin esto el display-only se siente mudo.
- **Sin `useEffect` de auto-selección** — los peers no son seleccionables, cualquier lógica de autoselect es código muerto.

## Criterios de estado del card VPS

### `mangleActive`
Derivado de `activeNodeVrf !== null`.

**Why:** Hoy el frontend llama `/tunnel/mangle-access` justo después de `/tunnel/activate` en `NodeCard.handleActivate`, así que siempre que hay túnel activo hay también regla mangle ACCESO-DINAMICO para el VPS.

**How to apply:** Si en el futuro se añade un modo "solo address-list sin mangle", habrá que diferenciar `tunnelActive` y `mangleActive` con un flag independiente. Mientras la activación sea atómica (tunnel + mangle), este criterio es correcto.

### `vpsWgActive`
Derivado del handshake WireGuard del peer VPS: activo si el último handshake está dentro del threshold, aunque el VPS esté temporalmente caído.

**Why:** Consistente con cómo el backend calcula `active` en `/api/wireguard/peers`.

**How to apply:** No cambiar la lógica localmente en el frontend — mantener paridad con el cálculo del backend.

## Defensas backend `/api/tunnel/mangle-access`

Aplicadas en `server/routes/core.routes.js`:
- `safeWrite` con timeout ampliado a **15s** para print y add (antes 6s, timeouteaba en RouterOS con muchas reglas).
- Pausas `setTimeout(r, 150/200)` entre la limpieza y los dos add sucesivos.
  - **Why:** El protocolo `node-routeros` (RouterOS API) es estrictamente secuencial; dos writes encolados sin margen pueden desincronizar la conexión y hacer que solo la primera regla (VPS) se cree, fallando la segunda (operador) con 500.
- Logging detallado con prefijo `[MANGLE-ACCESS]` (ej. `✓ Regla VPS/Operador creada`).

**How to apply:** Si vuelve a reportarse el bug de "solo se crea la regla VPS, la del operador falla con 500", pedir los logs del backend filtrados por `[MANGLE-ACCESS]` — indicarán exactamente en qué `safeWrite` cayó.
