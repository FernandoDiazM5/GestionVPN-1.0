# 📚 Documentación — GestionVPN-1.0

Punto de entrada a toda la documentación del proyecto.

## 📘 Manual completo (grado replicación) — [`docs/manual/`](./manual/00_Indice_y_Trazabilidad.md)
Para entender, operar y **reconstruir el sistema desde cero** (panel + MikroTik + VPS), con la diferencia 🟢 local / 🔵 VPS marcada en todo.

| # | Documento | Para |
|---|---|---|
| 00 | [Índice y trazabilidad](./manual/00_Indice_y_Trazabilidad.md) | Glosario + matriz necesidad→función→archivo→regla→test |
| 01 | [Tipos de usuario](./manual/01_Tipos_de_Usuario.md) | Roles, permisos, flujos de cuenta |
| 02 | [Referencia de funciones](./manual/02_Referencia_de_Funciones.md) | Qué hace cada función (backend + frontend) |
| 03 | [Config servidor VPN (MikroTik)](./manual/03_Config_Servidor_VPN_MikroTik.md) | VPN, VRF, mangle, firewall del Core |
| 04 | [Config VPS](./manual/04_Config_VPS.md) | Docker, wg0, secretos, nginx, jobs |
| 05 | [Local vs VPS](./manual/05_Local_vs_VPS.md) | Matriz completa de diferencias |
| 06 | [Guía de replicación](./manual/06_Guia_Replicacion.md) | Tutorial paso a paso desde cero |

## 🏛️ Arquitectura (diagramas) — [`docs/arquitectura/`](./arquitectura/README.md)
- [Documento maestro de arquitectura](./arquitectura/Project_Architecture_Blueprint.md) — capas, stack, patrones, ADRs.
- [C4 MikroTik ↔ funciones](./arquitectura/C4_MikroTik_Funciones.md) — flujos de activar-túnel, provisión, escaneo, VRF, mangle.

## 📎 Referencia rápida en la raíz del repo
- [`HANDOFF.md`](../HANDOFF.md) — estado vivo + el **porqué** de cada regla (§4).
- [`DESPLIEGUE_VPS.md`](../DESPLIEGUE_VPS.md) · [`MIGRACION_RED_GESTION.md`](../MIGRACION_RED_GESTION.md) — runbooks de red.

---
*Generado 2026-06-24 sobre `cfa8de0`. Mantener ante cambios estructurales (skill `handoff-keeper` para el día a día).*
