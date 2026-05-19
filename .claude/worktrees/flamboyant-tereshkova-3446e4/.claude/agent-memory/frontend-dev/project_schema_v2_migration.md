---
name: SQLite Schema v1 to v2 Migration (Frontend)
description: Frontend types updated to match backend v2 field names - activo->is_active, frecuencia_ghz->frecuencia_mhz, registrado_en->created_at, etc.
type: project
---

Frontend types and references updated on 2026-04-11 to match backend SQLite v2 schema.

**Key field renames applied:**
- `activo` -> `is_active` (RegisteredAp, SavedDevice)
- `frecuencia_ghz` -> `frecuencia_mhz` (RegisteredAp)
- `registrado_en` -> `created_at` (RegisteredAp)
- `creado_en` -> `created_at` (ApNode, Torre)
- `clave_ssh` -> `clave_ssh_enc` (comment only, never sent to frontend)
- `ultima_vez_visto` -> `last_seen` (KnownCpe, useTopologySync inline type, NetworkTopologyModule)
- `cpe_mac` -> `cpe_id` (SignalSnapshot, now integer FK)
- `nodo_id` -> `ap_group_id` (RegisteredAp, now integer FK)
- Table names in comments: `cpes_conocidos` -> `cpes`, `historial_senal` -> `signal_history`

**Why:** Backend migrated SQLite schema to v2 with normalized integer FKs and English-named fields.

**How to apply:** When adding new frontend types that map to backend tables, use v2 names. The `Torre` interface in `api.ts` still uses `nodo_id` as a string field because the backend view `v_torre_full` returns it that way. The Dexie topology DB did NOT need a version bump because none of the renamed fields are Dexie indexes.

**Critical identity changes (2026-04-11):**
- `SavedDevice.nodeId` is now the UUID of the `ap_group` (not mikrotik `.id` or integer FK). Cannot compare directly to `NodeInfo.id`.
- `Torre.nodo_id` is now `ppp_user` string (not integer FK). Compare against `node.ppp_user`, not `node.id`.
- `SavedDevice.nodeName` is the ONLY reliable link between devices (ap_groups) and VPN nodes. Use `device.nodeName === node.nombre_nodo` for matching.
- `ap_groups` table has NO FK to `nodes` table — they are independent entities linked only by name convention.
- `SavedDevice` now includes `wlanMac?: string` and `wifiPassword?: string`.
- In `useTopologySync.ts`: all `torre.nodo_id` lookups use `n.ppp_user === torre.nodo_id`. AP-to-torre matching uses `ap.nodeName === node.nombre_nodo`.
- In `ApMonitorModule.tsx`: `activeNodeId` replaced by `activeNodeName` (uses `node.nombre_nodo`). Group key is `d.nodeName`, filter compares `g.nodeName === activeNodeName`.
- In `NetworkTopologyModule.tsx`: `devicesByNode` renamed to `devicesByNodeName`, keyed by `d.nodeName`. Lookup uses `n.nombre_nodo`.
- In `TowerDetailPanel.tsx`: select option value changed from `n.id` to `n.ppp_user` (matches what backend returns as `nodo_id`).
