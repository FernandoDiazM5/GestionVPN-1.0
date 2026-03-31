---
name: rbac-auth
description: >
  Skill de autenticación y control de acceso basado en roles (RBAC) para el proyecto
  MikroTik VPN Manager. Cubre JWT, bcrypt, middleware de verificación, gestión de
  usuarios SQLite, flujo de Setup Inicial, y el sistema de logout automático por
  expiración de token.
---

# Sistema RBAC + JWT — MikroTik VPN Manager

## Arquitectura General

```
Frontend (React)                    Backend (Express)
─────────────────                   ─────────────────
RouterAccess.tsx                    server/routes/auth.routes.js
  → POST /api/auth/login            → bcrypt.compare(password, hash)
  ← { token, role, username }       ← jwt.sign({ username, role }, SECRET, { expiresIn: '8h' })

apiClient.ts (globalToken)          server/auth.middleware.js (verifyToken)
  → Header: 'Authorization: Bearer' → jwt.verify(token, SECRET)
                                     → req.user = { username, role }
                                     → req.mikrotik = { ip, user, pass }  ← inyectado de SQLite
```

## Archivos Clave

| Archivo | Responsabilidad |
|---|---|
| `server/auth.middleware.js` | verifyToken: valida JWT, inyecta req.mikrotik |
| `server/routes/users.routes.js` | CRUD de vpn_users (solo admins) |
| `server/db.service.js` | Tabla vpn_users, bcryptjs, saveAppSetting |
| `vpn-manager/src/utils/apiClient.ts` | Interceptor 401/403 → auth_expired |
| `vpn-manager/src/store/db.ts` | JWT cifrado en IndexedDB (dbService) |
| `vpn-manager/src/context/VpnContext.tsx` | handleLogout, listener auth_expired |
| `vpn-manager/src/components/RouterAccess.tsx` | Login UI + Setup Inicial |
| `vpn-manager/src/components/UserManagementModule.tsx` | CRUD de usuarios (UI admin) |

## Roles del Sistema

| Rol | Permisos |
|---|---|
| `admin` | Acceso total: Settings, CRUD usuarios, todas las operaciones |
| `operator` | Gestión de nodos y APs, sin acceso a Settings ni Users |
| `viewer` | Solo lectura — no puede modificar nada |

## Setup Inicial (Bootstrap)

Al primer arranque, no hay usuarios en `vpn_users`. El endpoint `/api/auth/status` devuelve:
```json
{ "needsSetup": true }
```
`RouterAccess.tsx` detecta esto y muestra el formulario de creación del primer administrador.
Una vez creado, este flujo queda bloqueado permanentemente.

## Flujo de Login

```javascript
// 1. Cliente → POST /api/auth/login { username, password }
// 2. Backend busca user en vpn_users por username
// 3. bcrypt.compare(password, user.password_hash)
// 4. Si OK → jwt.sign({ username, role }, JWT_SECRET, { expiresIn: '8h' })
// 5. Devuelve { success: true, token, role, username }

// Frontend:
setApiToken(token);  // guarda en memoria para inyectar en headers
await dbService.saveStore({ credentials: { user, role, token } });  // cifrado en IndexedDB
```

## Middleware verifyToken

```javascript
const verifyToken = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token no provisto.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { username, role }

        // Inyección de credenciales MikroTik (Zero-Trust: frontend no las conoce)
        const mtIp   = await getAppSetting('MT_IP');
        const mtUser = await getAppSetting('MT_USER');
        const mtPass = await getAppSetting('MT_PASS');
        req.mikrotik = (mtIp && mtUser && mtPass)
            ? { ip: mtIp, user: mtUser, pass: decryptPass(mtPass) }
            : null;

        next();
    } catch (err) {
        return res.status(403).json({ message: 'Token expirado.', logout: true });
    }
};
```

**Códigos de Estado:**
- `401 Unauthorized` → No se envió token (header Authorization ausente)
- `403 Forbidden` → Token inválido, corrupto o expirado

## Interceptor de Expiración (apiClient.ts)

```typescript
// Ambos códigos disparan el logout automático:
if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new Event('auth_expired'));
}
```

`VpnContext.tsx` escucha el evento con `window.addEventListener('auth_expired', handleLogout)`.
`handleLogout()` limpia IndexedDB, borra el token en memoria, y lleva al usuario al Login.

## Protección de Rutas en el Backend

**Patrón para rutas admin-only:**
```javascript
router.post('/users/delete', async (req, res) => {
    // Guard inline — solo admins
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Solo administradores.' });
    }
    // ... lógica
});
```

## Fail-Safes de Seguridad (users.routes.js)

1. **No borrar al último admin:**
   ```javascript
   const adminCount = await db.get("SELECT COUNT(*) as c FROM vpn_users WHERE role='admin'");
   if (target.role === 'admin' && adminCount.c <= 1) return 403;
   ```

2. **No borrar la sesión activa:**
   ```javascript
   if (target.username === req.user.username) return 403;
   ```

3. **No degradar al último admin:**
   Aplicar la misma validación antes de `UPDATE role`.

## Almacenamiento del JWT en el Frontend

El JWT se cifra localmente con AES-GCM antes de guardarse en IndexedDB:
```typescript
// db.ts — saveStore()
const encPass = await encryptText(data.credentials.token);
// stored: { user, role, encPass }  ← el JWT plano nunca toca el disco sin cifrar
```

Al restaurar la sesión (recarga de página):
```typescript
// getStore() → decryptText(encPass) → setApiToken(token)
```

## Configuración de Credenciales MikroTik (settings.routes.js)

```javascript
// Las credenciales maestras del MikroTik se guardan cifradas en app_settings:
await saveAppSetting('MT_PASS', encryptPass(plainPassword));

// El frontend nunca recibe el valor real, solo una máscara:
{ MT_IP: '192.168.x.x', MT_USER: 'admin', MT_PASS: '••••••••' }

// El backend las inyecta automáticamente en req.mikrotik por verifyToken.
```
