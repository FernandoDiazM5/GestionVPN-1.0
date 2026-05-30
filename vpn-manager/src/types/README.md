# Types Directory

Contratos TypeScript para API backend.

## Contenido

- **api.ts** (108 líneas) - Tipos genéricos de API
- **devices.ts** (249 líneas) - Tipos de dispositivos
- **apMonitor.ts** (157 líneas) - Tipos de monitoreo AP

## ⚠️ CRÍTICO

Estos tipos **DEBEN estar sincronizados** con respuestas del backend.

### Si Backend Agrega un Campo

1. Backend retorna nuevo campo en respuesta
2. Actualizar interface aquí
3. TypeScript error en componente que lo usa
4. Componente se actualiza automáticamente

### Ejemplo

```typescript
// Backend retorna:
{ id, name, ip, signal, ccq }

// Frontend espera:
interface Device {
  id: string;
  name: string;
  ip: string;
  signal?: number;  // ← Nuevo campo
  ccq?: number;     // ← Nuevo campo
}
```

## Convenciones

- Usar `type` para unions: `type Status = 'active' | 'inactive'`
- Usar `interface` para objetos
- Propiedades opcionales con `?`
- Documentar con comentarios

## Sincronización

Ver documentación: **FRONTEND_ARCHITECTURE_BLUEPRINT.md** Sección 6

**Última actualización:** 2026-05-29
