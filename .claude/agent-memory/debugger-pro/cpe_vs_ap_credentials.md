---
name: CPE SSH credentials are separate from AP credentials
description: CPE devices (LiteBeam, etc.) have their own SSH credentials stored in cpes_conocidos, not shared with the AP parent. Using AP creds on a CPE always fails.
type: project
---

CPEs (Ubiquiti LiteBeam M5, 5AC Gen2 in Station mode) are different physical devices from their parent AP. They have independent SSH credentials.

The backend route `POST /api/ap-monitor/cpes/:mac/detail-direct` previously used only the AP's credentials (`aps.usuario_ssh / clave_ssh`) when connecting to a CPE, which always failed with "All configured authentication methods failed".

**Fix applied (2026-03-30):**

Credential resolution chain in `server/ap.routes.js`:
1. CPE's own stored credentials from `cpes_conocidos.usuario_ssh / clave_ssh / puerto_ssh`
2. AP parent credentials from `aps` table (some networks reuse the same password)
3. Node parent credentials from `node_ssh_creds`
4. Credentials sent by the frontend (the AP's credentials from `SavedDevice`)
5. **Default `ubnt/ubnt`** — most factory/field LiteBeam units use this

Auto-save behavior: when a credential succeeds and no CPE credentials were stored, the working credentials are saved to `cpes_conocidos` so future detail requests skip the credential trial loop.

**Schema change:** `db.service.js` migration adds `usuario_ssh`, `clave_ssh`, `puerto_ssh` to `cpes_conocidos`.

**New endpoint:** `PUT /api/ap-monitor/cpes/:mac/credentials` — saves CPE-specific credentials.

**Frontend:** `CpeDetailModal` (`ApMonitorModule.tsx`) now shows a credential form automatically when an auth error is detected (regex match on "authentication", "configured method", etc.). The form defaults `user=ubnt`, saves credentials via the new PUT endpoint, then retries the connection.

**Why:** CPEs and APs are independent airOS devices with their own authentication. The AP's SSH password is set by the network admin for that AP only.

**How to apply:** Any time a backend route does SSH to a device that is not an AP, check whether it has its own credential storage separate from the AP table.
