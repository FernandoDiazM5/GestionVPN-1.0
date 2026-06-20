---
name: handoff-keeper
description: Use this skill to read, update, or maintain the project handoff/context document. Trigger whenever the user says "actualiza el handoff", "envía/manda esto al handoff", "guarda esto en el handoff", "agrega al handoff", "esto va al handoff como regla/función/proceso", "lee el handoff", "ponme en contexto", "qué estábamos haciendo", "resume el contexto", "handoff de la sesión", or starts a new session and needs project context. Also trigger when finishing a chunk of work and the user wants to record what changed, or when a new durable rule/function/process must be persisted. This skill governs the split between HANDOFF.md (durable) and HANDOFF_LOG.md (chronological), and prevents the handoff from re-bloating.
---

# Handoff Keeper

Mantiene el sistema de handoff de **GestionVPN-1.0** en dos archivos, evitando que el contexto vuelva a inflarse (la causa raíz por la que reglas/procesos durables se "perdían": quedaban enterrados en un log de miles de líneas).

## El sistema de dos archivos

| Archivo | Qué es | Cómo se escribe | Se lee… |
|---|---|---|---|
| **`HANDOFF.md`** | Contexto **DURABLE y vigente**: lo que sigue siendo cierto hoy. | Se **edita/reemplaza** en su lugar. Presupuesto: **≤ ~200 líneas**. | **Siempre al iniciar sesión.** |
| **`HANDOFF_LOG.md`** | **Bitácora cronológica** append-only: qué se hizo cada sesión. | Solo se **añaden** entradas nuevas arriba; nunca se edita lo viejo. | Bajo demanda (detalle histórico). |

> Regla de oro: **lo durable se reemplaza, lo cronológico se acumula.** Nunca al revés.

## Protocolo de INICIO de sesión

Cuando el usuario pida contexto, arranque, o "qué estábamos haciendo":
1. Lee `HANDOFF.md` **completo** (es corto por diseño).
2. Si necesitas detalle de una sesión concreta, busca en `HANDOFF_LOG.md` (no lo cargues entero; usa Grep por fecha/sección).
3. Resume al usuario: estado actual (§0), pendientes activos (§7), y cualquier regla relevante a lo que va a hacer.

## Protocolo de ACTUALIZACIÓN — clasifica ANTES de escribir

Cuando el usuario diga *"actualiza el handoff"*, *"envía/manda esto al handoff"*, *"guarda esto"*, etc., **clasifica cada ítem** y colócalo en el archivo correcto:

| Tipo de información | Va a | Sección |
|---|---|---|
| Cambió el **estado actual** (tips git, tests, salud, lo último en curso) | `HANDOFF.md` | §0 — **reemplaza** lo anterior |
| Nueva **regla / invariante** ("nunca…", "siempre…", "prohibido…") | `HANDOFF.md` | §4 — añade/actualiza la regla |
| Nueva **función / proceso / runbook** vigente | `HANDOFF.md` | §5 ó §6 — añade/actualiza |
| Cambió **arquitectura, datos o fuente de verdad** | `HANDOFF.md` | §2 / §3 — actualiza en su lugar |
| Cambió un **pendiente** (nuevo, hecho, repriorizado) | `HANDOFF.md` | §7 — mueve/edita la fila |
| **Narrativa de la sesión** ("hoy hice X, arreglé Y, commit Z, bug encontrado") | `HANDOFF_LOG.md` | nueva entrada arriba |

**Si dudas:** ¿esto seguirá siendo cierto dentro de 3 meses y alguien lo necesitará para no romper algo? → durable (`HANDOFF.md`). ¿Es un "qué pasó tal día"? → bitácora (`HANDOFF_LOG.md`).

### Cuando el usuario dice "esto va como regla / función / proceso"
Es una señal explícita de contenido **durable**. Va a `HANDOFF.md`:
- **regla** → §4 (Reglas e invariantes), redactada como imperativo ("Nunca…", "Siempre…", "Server-side: …").
- **función / proceso** → §5 (Procesos vigentes) ó §6 (Runbooks), describiendo el flujo VIGENTE, no cómo se construyó.
Si la nueva regla/proceso **reemplaza** una anterior, edita la existente — no acumules versiones contradictorias.

## Formato de una entrada nueva en `HANDOFF_LOG.md`

Añádela **arriba** (debajo del encabezado, antes de la entrada previa), encabezada por fecha:

```markdown
> **Sesión AAAA-MM-DD — <título corto>.** Rama `dev` (commits `aaa` → `bbb`). Estado: <tests/tsc>.
> - <qué cambió, decisiones, bugs encontrados>.
> - Pendiente: <si aplica>.
```

## Reglas de redacción (heredadas y adaptadas)

- **No dupliques** lo que ya vive en otros artefactos (`DESPLIEGUE_VPS.md`, `MIGRACION_RED_GESTION.md`, `INFORME_*.md`, PRDs, commits, código). **Referéncialos por ruta**, no los copies.
- **Redacta secretos**: nunca pegues claves, contraseñas, tokens o llaves privadas en ningún handoff. Si una credencial se expuso, deja una nota "rotar X" en pendientes, sin el valor.
- **Fechas absolutas** (`2026-06-20`), nunca "ayer"/"hoy".
- **Sección "skills sugeridas"** (opcional): si la próxima sesión se beneficiaría de skills del proyecto (`mikrotik-vpn-expert`, `rbac-auth`, `backend-express`, `ubiquiti-json`, `react-ui-expert`, `debug-session`, etc.), nómbralas en §0 o en la entrada del log.
- **Cuida el presupuesto:** si `HANDOFF.md` supera ~200 líneas, comprime: mueve detalle histórico al LOG y deja en el durable solo lo vigente. El doc durable debe poder leerse de un vistazo al iniciar sesión.

## Estructura canónica de `HANDOFF.md`

Mantén estas secciones (no las renumeres sin razón):
`§0 Estado actual` · `§1 Producto y roles` · `§2 Arquitectura y stack` · `§3 Datos y APIs` · `§4 Reglas e invariantes` · `§5 Procesos/funciones vigentes` · `§6 Arranque rápido + runbooks` · `§7 Pendientes activos` · `§8 Cómo mantener este documento`.

## Checklist antes de cerrar
- [ ] ¿El estado (§0) refleja los tips git y tests reales? (verifica con `git log --oneline -1`).
- [ ] ¿Las reglas/procesos nuevos quedaron en `HANDOFF.md`, no en el log?
- [ ] ¿La narrativa de la sesión quedó en `HANDOFF_LOG.md` (arriba, con fecha)?
- [ ] ¿Sin secretos? ¿Referencias a otros docs por ruta en vez de copiarlos?
- [ ] ¿`HANDOFF.md` sigue bajo ~200 líneas?
