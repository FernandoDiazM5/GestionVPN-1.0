---
name: git-review
description: Use this skill whenever the user wants to review changes before committing, asks for a pre-commit review, wants to check if something is safe to commit, asks "is this ready to commit?", or wants to catch bugs/secrets/regressions in their diff. Also trigger when the user says they're about to push or create a PR and wants a last check. If there are staged or unstaged changes and the user wants any kind of quality gate before committing, use this skill.
---

# Pre-Commit Review

## Proceso

1. `git diff HEAD` (o `git diff --staged` si hay cambios staged)
2. `git status` para ver el panorama completo
3. Revisar con el checklist
4. Reportar por severidad
5. Arreglar críticos directamente; preguntar antes de cambiar warnings

## Checklist

### 🔴 Críticos (bloquean el commit)

**Secretos hardcodeados**
- Contraseñas, tokens, API keys en archivos fuente
- Credenciales RouterOS, claves SSH privadas, passwords de Ubiquiti en JS/TS
- Patrón: `password =`, `secret =`, `token =`, `apiKey =` asignados a un string literal
- `.env` con credenciales reales commiteado al repo

**Regresiones de seguridad**
- CORS abierto de vuelta (`origin: '*'`) — ya fue cerrado una vez
- Crypto rebajado (AES-128 en vez de AES-256, IV débil)
- Autenticación removida o bypasseada

**Bugs de crash**
- `item.id` donde debería ser `item['.id']` para objetos RouterOS
- `await` faltante en un Promise que debe resolverse antes de la siguiente línea
- `Promise.all` donde `Promise.allSettled` era necesario en cleanup/deactivation
- Catch vacío que traga errores en rutas críticas (provision, deactivate)

**Rompedores de build**
- Errores TypeScript que fallarán `tsc` (interface desincronizada, tipo incorrecto)
- Import de módulo que no existe o ruta incorrecta
- Export removido que alguien importa

### 🟡 Warnings (reportar, no bloquear)

- `any` cast introducido donde había tipo real
- `console.log` en producción con datos sensibles
- Campo opcional cambiado a requerido sin actualizar llamadores
- Timeout cambiado a valor irrazonable (< 1000ms o > 60000ms)
- `database.sqlite` staged — archivo binario, nunca debe commitearse

### 🟢 Info (solo anotar)
- TODOs nuevos añadidos
- Debug logs no sensibles

## Formato de Salida

```
## Pre-Commit Review

### 🔴 Críticos
- **[archivo:línea]** Descripción y por qué importa.

### 🟡 Warnings
- **[archivo:línea]** Descripción.

### Veredicto
✅ Listo para commit / ⚠️ Resolver warnings primero / ❌ No commitear
```

## Reglas Específicas del Proyecto

| Patrón | Por qué importa |
|--------|----------------|
| `item.id` en respuesta RouterOS | Debe ser `item['.id']` — la clave tiene un punto |
| `Promise.all` en deactivate/cleanup | Usar `allSettled` para que un fallo no aborte el resto |
| `origin: '*'` en CORS | Ya fue restringido a localhost — no reabrir |
| `AES-128` o `AES-GCM-128` | El proyecto usa AES-256-GCM — no rebajar |
| `database.sqlite` en diff | Archivo binario — verificar que esté en `.gitignore` |
| Credenciales RouterOS como string literal | Deben venir de `req.body` o env vars |

## Archivos a Escanear por Secretos

Siempre revisar en el diff:
- `server/index.js`, `server/api.routes.js`, `server/db.service.js`
- `server/ubiquiti.service.js`, `server/routeros.service.js`
- Cualquier archivo `.env` nuevo — confirmar que está en `.gitignore`
