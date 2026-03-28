---
name: debug-session
description: Use this skill whenever the user reports a bug, error, or unexpected behavior and wants structured help diagnosing it. Trigger for: pasting an error message or stack trace, "it's not working", "I'm getting X error", "the frontend shows nothing", "SSH fails", "RouterOS isn't responding", "the database isn't updating", or any request to trace why something broke. Also trigger when the user asks to debug, investigate, or trace a problem through the full frontend→backend→hardware stack. If there's an error and a question, use this skill.
---

# Debug Session

Run a structured debugging session. The goal is to find the root cause efficiently — not to throw fixes at the wall. Work through layers from symptom to source.

## Process

### Step 1: Capture the symptom
Ask for (or extract from context):
- The exact error message or unexpected behavior
- Where it was observed (browser console, server logs, terminal)
- What action triggered it
- Whether it worked before (regression) or never worked

### Step 2: Locate the layer
Determine which layer owns the problem:

```
Browser UI  →  React state / component render
     ↓
HTTP request  →  fetch() / network tab
     ↓
Express route  →  api.routes.js handler
     ↓
Service layer  →  db.service.js / ubiquiti.service.js
     ↓
External  →  RouterOS API :8728 / Ubiquiti SSH :22 / SQLite
```

Ask: "Does the error occur before or after the HTTP request leaves the browser?"

### Step 3: Generate ranked hypotheses
List 3–5 possible causes, ordered by likelihood. For each:
- What would cause this?
- What evidence would confirm it?
- What's the fastest way to check?

### Step 4: Verify, don't assume
For each hypothesis, determine the minimal check:
- Add a `console.log` at a specific point
- Check a specific field in the browser network tab
- Run a specific SSH command against the device
- Query SQLite directly: `SELECT * FROM nodes WHERE id = X`

Do not apply fixes until the root cause is confirmed.

### Step 5: Fix and verify
Once the cause is confirmed:
- Apply the minimal fix
- Explain why it works
- Note if the same bug could exist elsewhere

---

## Layer-Specific Debugging Guide

### Frontend (React/TypeScript)
**Symptoms**: blank screen, undefined values, state not updating, TypeScript errors at runtime

Check order:
1. Browser console — any errors or warnings?
2. Network tab — did the HTTP request go out? What was the response status and body?
3. React DevTools — what does the component state look like?
4. `VpnContext.tsx` — is the fetch happening? Is the state setter being called?

Common causes:
- `res.data` vs `res` — depends on whether using axios or fetch+json()
- RouterOS `.id` field accessed as `item.id` instead of `item['.id']`
- Async state update not yet reflected when the next render reads it
- `useEffect` dependency array missing a value, causing stale closure

### Backend (Express / Node.js)
**Symptoms**: 500 errors, wrong response shape, missing fields, crashes

Check order:
1. Server terminal — is there a stack trace?
2. `api.routes.js` — is the route handler doing what it should?
3. Is the error from a service call (RouterOS API, SSH, SQLite)?
4. Are environment variables set? (`process.env.ROUTEROS_HOST` etc.)

Common causes:
- `await` missing on an async function (returns a Promise, not the value)
- RouterOS API returns an array — code expects an object
- SQLite `better-sqlite3` is synchronous — don't `await` it
- SSH connection timeout (Ubiquiti devices drop idle connections)

### RouterOS API (:8728)
**Symptoms**: "connection refused", "ECONNREFUSED", "login failed", commands return empty

Check order:
1. Can the server reach the MikroTik? `ping <ip>` from server
2. Is port 8728 open? `telnet <ip> 8728` or check MikroTik firewall
3. Are credentials correct? Test with a minimal API call
4. Is the API library (`node-routeros` / `RouterOSAPI`) initialized correctly?

Common causes:
- MikroTik firewall blocking the server's IP on port 8728
- Wrong API port (some RouterOS versions use 8729 for SSL)
- Session limit reached — too many open connections, need to close/reuse
- API returns `.id` with a dot — not a standard JS property name

### Ubiquiti SSH (:22)
**Symptoms**: `ssh2` handshake fails, "No matching key exchange", "authentication failed"

Check order:
1. Can the server reach the AP? `ping <ip>`
2. Is SSH accessible? `ssh -v user@ip` from server
3. Does `ubiquiti.service.js` use the right legacy algorithms?
4. Are credentials correct? (airOS uses `ubnt/ubnt` by default)

The `ssh2` config must include legacy algorithms for older airOS firmware:
```js
algorithms: {
  kex: ['diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1'],
  cipher: ['aes128-cbc', 'aes256-cbc', '3des-cbc'],
  serverHostKey: ['ssh-rsa', 'ssh-dss'],
  hmac: ['hmac-sha1', 'hmac-md5']
}
```
If the handshake fails after adding these, check the airOS firmware version — very old firmware may need `diffie-hellman-group1-sha1` added.

### SQLite
**Symptoms**: "database is locked", data not persisting, wrong query results

Check order:
1. Is `database.sqlite` in the right path relative to where Node starts?
2. Is `better-sqlite3` being used synchronously (no `await`)?
3. Are there multiple Node processes trying to write simultaneously?
4. Is the schema up to date? (tables may be missing after a schema change)

Common causes:
- Running `npm start` twice — second process gets "database is locked"
- Schema changed in code but old `database.sqlite` still on disk — delete and let it recreate
- In Docker: path inside container doesn't match the volume mount

---

## Output Format

```
## Debug Session: [brief description of the bug]

### Symptom
[exact error or behavior]

### Layer
[which layer owns this — UI / HTTP / Express / Service / External]

### Hypotheses (ranked)
1. [Most likely] — [evidence needed]
2. [Second] — [evidence needed]
3. [Third] — [evidence needed]

### Verification Steps
- [ ] Check X at Y
- [ ] Log Z in file:line
- [ ] Query: SELECT ...

### Root Cause
[once confirmed]

### Fix
[minimal change applied]
```
