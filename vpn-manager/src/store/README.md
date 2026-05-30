# Store Directory

Persistencia local con Zustand + LocalForage + IndexedDB.

## Contenido

- **db.ts** (119 líneas) - Almacenamiento de credenciales cifradas
- **deviceDb.ts** (196 líneas) - Caché de dispositivos escaneados
- **cpeCache.ts** (53 líneas) - Caché de equipos CPE

## Cuándo Usar Store vs Context

| Necesidad | Usar |
|-----------|------|
| Autenticación | Context |
| Módulo activo | Context |
| Datos que persisten sesión | **Store** |
| Caché de escaneos | **Store** |
| Preferencias del usuario | **Store** |

## db.ts - Credenciales

Almacena credenciales MikroTik **cifradas** en IndexedDB.

```tsx
const creds = await dbService.loadCredentials();
if (creds) {
  // Ya tiene credenciales guardadas
}
```

## deviceDb.ts - Caché de Dispositivos

Cachea resultados de escaneos para búsqueda rápida sin re-scan.

```tsx
await deviceDb.cacheDevices(devices);
const cached = await deviceDb.getCachedDevices();
```

## Seguridad

- Credenciales se cifran con crypto.ts antes de guardar
- IndexedDB es local (no se sincroniza a servidor)
- Datos se limpian al logout

**Última actualización:** 2026-05-29
