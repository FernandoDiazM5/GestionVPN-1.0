---
name: DB Cleanup - Orphan Devices Endpoint
description: Endpoint POST /api/db/cleanup-orphan-devices para eliminar devices sin nodo padre válido
type: project
---

Endpoint `POST /api/db/cleanup-orphan-devices` implementado en `server/api.routes.js` (al final, antes de `module.exports`).

Lógica:
1. Obtiene todos los `id` válidos desde `nodes`.
2. Hace `JSON_EXTRACT(data, '$.nodeId')` en `devices` y filtra los que no están en la lista válida.
3. Elimina en orden: `historial_senal` (by `ap_id`) → `cpes_conocidos` (by `ap_id`) → `devices`.
4. Guarda con placeholders dinámicos para evitar SQL injection.
5. Tiene guardia de seguridad: si `validNodeIds.length === 0`, aborta la limpieza para no borrar todo.

Respuesta:
```json
{
  "success": true,
  "devicesDeleted": 15,
  "cpesDeleted": 73,
  "historialDeleted": 0,
  "orphanIds": ["E43883B2B27A", ...],
  "orphanNodeIds": ["*19", "*17"]
}
```

**Por qué se necesitó:** El cascade delete no existía cuando se eliminó el nodo "agapito" (nodeIds `*17` y `*19`). Quedaron 15 devices huérfanos con 73 CPEs asociados. El cascade fix se implementó después.

**How to apply:** Si vuelven a quedar huérfanos por eliminación manual de nodos sin cascade, llamar `POST /api/db/cleanup-orphan-devices`. El endpoint es idempotente.
