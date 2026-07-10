# 📚 Documentación de arquitectura — GestionVPN-1.0

Suite de documentación de arquitectura. Generada el **2026-06-24** sobre `cfa8de0`.

| Documento | Qué cubre | Skill / fuente |
|---|---|---|
| [`Project_Architecture_Blueprint.md`](./Project_Architecture_Blueprint.md) | **Documento maestro**: capas, stack, patrones, datos, seguridad, despliegue, ADRs y guía para feature nueva | `architecture-blueprint-generator` |
| [`C4_MikroTik_Funciones.md`](./C4_MikroTik_Funciones.md) | **Diagramas C4 MikroTik↔funciones**: cómo el Core trabaja con activar-túnel, provisión, escaneo, VRF y mangle | `c4-architecture` |

### Documentos relacionados (raíz del repo)
- [`HANDOFF.md`](../../HANDOFF.md) — estado vivo del proyecto + el **porqué** de cada regla/invariante (§4).
- [`DESPLIEGUE_VPS.md`](../../DESPLIEGUE_VPS.md) · [`MIGRACION_RED_GESTION.md`](../../MIGRACION_RED_GESTION.md) — runbooks de red.
- ~~[`ARQUITECTURA.md`](../../ARQUITECTURA.md)~~ — **superseded** por el blueprint (quedó en 2026-06-10).

### Cómo mantener esta suite
Actualizar ante **cambios estructurales** (nueva capa/servicio, cambio de routing, nuevo contrato de dominio, cambio de topología de despliegue). Los cambios de feature menores van al `HANDOFF_LOG.md` con la skill `handoff-keeper`.
