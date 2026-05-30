# Components Directory

## Estructura

Componentes React agrupados por dominio funcional.

### Directorios

- **Auth/** - Autenticación y login (RouterAccess)
- **VPN/** - Gestión de tuneles VPN (SSTP, WireGuard, PTP)
- **Devices/** - Escaneo y descubrimiento de dispositivos
- **Monitor/** - Monitoreo en tiempo real de Access Points
- **Settings/** - Configuración del sistema y gestión de usuarios
- **Common/** - Componentes compartidos (modales, tarjetas genéricas)

## Patrón de Componentes

Cada componente es auto-contenido:
- `useState` para estado local
- `useVpn()` para estado global
- API calls integradas
- Estilos Tailwind CSS

## Agregar Nuevo Componente

1. Crear archivo .tsx en carpeta correspondiente
2. Exportar como default
3. Importar en App.tsx si es módulo principal
4. Actualizar imports en componentes relacionados

## Total de Archivos

- 13 componentes React (.tsx)
- Distribuidos en 6 carpetas por dominio
- ~12,561 líneas de código TypeScript + JSX

**Última actualización:** 2026-05-29
