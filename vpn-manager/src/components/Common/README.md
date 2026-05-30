# Common Components

Componentes reutilizables en toda la aplicación.

## Contenido

- **ConfirmModal.tsx** - Modal de confirmación genérico
- **M5FullInfoModal.tsx** - Modal con información ampliada
- **DeviceCard.tsx** - Tarjeta individual de dispositivo

## Uso

### ConfirmModal

```tsx
import ConfirmModal from '@/components/Common/ConfirmModal';

<ConfirmModal 
  title="Confirmar acción"
  message="¿Estás seguro de que deseas continuar?"
  onConfirm={handleConfirm}
  onCancel={handleCancel}
  isDangerous={false}
/>
```

### M5FullInfoModal

Modal para mostrar detalles completos con scroll.
Útil para información ampliada de dispositivos.

### DeviceCard

Tarjeta genérica para mostrar información de dispositivos.
Se usa en múltiples módulos (Devices, Topology, etc).

## Principios

- Componentes pequeños y reutilizables
- Props bien tipadas en TypeScript
- Estilos con Tailwind CSS
- Sin lógica de negocio
- No hacen API calls directamente

**Última actualización:** 2026-05-29
