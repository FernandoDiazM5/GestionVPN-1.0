# Context Directory

Estado global de la aplicación con React Context API.

## Contenido

- **VpnContext.tsx** (412 líneas) - Estado compartido

## Hook de Uso

```tsx
import { useVpn } from '@/context/VpnContext';

const { 
  isAuthenticated, 
  nodes, 
  activeModule, 
  setActiveModule 
} = useVpn();
```

## Qué Está Aquí

- **Autenticación:** token, credenciales, permisos
- **Nodos VPN:** lista, estado, seleccionado
- **Navegación:** módulo activo
- **Tema:** dark mode toggle
- **Tuneles:** expiry, keepalive

## Qué NO Está Aquí

- Datos temporales → usar `useState` en componente
- Caché de API → usar `store/`
- Lógica de API → usar `utils/`
- Servicios especializados → usar `utils/services/`

## Performance

- Usa `useCallback` para evitar re-renders innecesarios
- Separa contextos si el bundle crece
- Memoiza componentes que consumen contexto

**Última actualización:** 2026-05-29
