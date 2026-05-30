# Utils Directory

Funciones reutilizables y servicios especializados.

## Contenido

### Raíz
- **apiClient.ts** (53 líneas) - HTTP client con JWT integrado
- **crypto.ts** (81 líneas) - Cifrado de credenciales locales
- **fetchWithTimeout.ts** (24 líneas) - Fetch robusto con timeout

### Subdirectorio
- **services/** - Servicios especializados

## apiClient.ts

Centraliza lógica de autenticación HTTP:

```tsx
import { setApiToken, getApiToken } from '@/utils/apiClient';

setApiToken(jwtToken);  // Después de login
const token = getApiToken();  // Para requests posteriores
```

Todos los requests incluyen:
- Header `Authorization: Bearer {token}`
- Header `Content-Type: application/json`

## crypto.ts

Cifra/descifra datos sensibles antes de guardar:

```tsx
const encrypted = encryptPassword(password, key);
const decrypted = decryptPassword(encrypted, key);
```

⚠️ **Nunca guardes contraseñas en plain text**

## fetchWithTimeout.ts

Wrapper de fetch con timeout para evitar cuelgues:

```tsx
const res = await fetchWithTimeout(url, options, 15000);
// Timeout a 15 segundos
```

## services/

Ver: **services/README.md**

**Última actualización:** 2026-05-29
