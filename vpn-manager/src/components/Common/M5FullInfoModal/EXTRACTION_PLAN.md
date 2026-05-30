# M5FullInfoModal Extraction Plan

## Componente Actual
**Archivo**: `src/components/Common/M5FullInfoModal.tsx`
**Tamaño**: 290 líneas
**Estado**: 1 hook (useState para copiedIp)
**Complejidad**: Media (4 secciones de datos, 3 sub-componentes internos, 1 helper)

---

## Estructura Propuesta

```
M5FullInfoModal/
├── M5FullInfoModal.tsx          (45 líneas) - Componente principal orquestador
├── index.ts                     (2 líneas) - Exportación pública
├── types.ts                     (8 líneas) - Props y tipos
├── hooks/
│   └── useCopiedIpState.ts      (11 líneas) - State del copy-to-clipboard
├── components/
│   ├── ModalBackdrop.tsx        (6 líneas) - Fondo semi-transparente
│   ├── ModalHeader.tsx          (25 líneas) - Encabezado con IP y modelo
│   ├── ModalContent.tsx         (8 líneas) - Contenedor scrollable
│   ├── EmptyState.tsx           (4 líneas) - Estado "Sin datos"
│   ├── M5Row.tsx                (8 líneas) - Fila etiquetada
│   ├── M5Section.tsx            (12 líneas) - Sección con título e ícono
│   ├── IfaceBlock.tsx           (15 líneas) - Bloque de interfaz
│   ├── SystemSection.tsx        (22 líneas) - Sección Sistema (host)
│   ├── WirelessSection.tsx      (67 líneas) - Sección Inalámbrico
│   ├── InterfacesSection.tsx    (35 líneas) - Sección Interfaces y tráfico
│   └── ServicesSection.tsx      (18 líneas) - Sección Servicios
├── utils/
│   ├── deviceFamily.ts          (7 líneas) - Helper detectFamily()
│   ├── styles.ts                (8 líneas) - Constantes de clases Tailwind
│   └── formatters.ts            (12 líneas) - Funciones de formato (MB, dBm, etc)
├── constants.ts                 (6 líneas) - Labels y mensajes
├── README.md                    - Documentación completa
└── EXTRACTION_PLAN_FINAL.md     - Reporte de implementación
```

---

## Archivos a Crear: 20 archivos

### Hooks (1)
1. **hooks/useCopiedIpState.ts** - Maneja state del copy-to-clipboard
   - Reemplaza: `const [copiedIp, setCopiedIp] = useState(false);`
   - Exporta: `useCopiedIpState()` que retorna `{ copiedIp, setCopiedIp, copyIp }`

### Utils (3)
2. **utils/deviceFamily.ts** - Detecta familia de dispositivo
   - Función: `detectFamily(dev: ScannedDevice | SavedDevice): 'ac' | 'm5' | 'unknown'`

3. **utils/styles.ts** - Constantes de estilos Tailwind
   - `modalContainerStyles`, `backdropStyles`, `headerStyles`, `sectionStyles`, etc.

4. **utils/formatters.ts** - Funciones de formato reutilizables
   - `formatMB()`, `formatDBm()`, `formatMHz()`, etc.

### Componentes Primitivos (3)
5. **components/M5Row.tsx** - Fila de datos etiquetada
6. **components/M5Section.tsx** - Sección con título e icono
7. **components/IfaceBlock.tsx** - Bloque de interfaz

### Componentes Modal Estructura (2)
8. **components/ModalBackdrop.tsx** - Fondo clickeable
9. **components/ModalHeader.tsx** - Encabezado con IP y badges

### Componentes de Contenido (1)
10. **components/ModalContent.tsx** - Contenedor con scroll

### Secciones de Datos (4)
11. **components/SystemSection.tsx** - Información de sistema (host)
12. **components/WirelessSection.tsx** - Información inalámbrica
13. **components/InterfacesSection.tsx** - Interfaces físicas y tráfico
14. **components/ServicesSection.tsx** - Servicios y gestión remota

### Componentes de Estado (1)
15. **components/EmptyState.tsx** - Mensaje "Sin datos disponibles"

### Tipos y Configuración (3)
16. **types.ts** - `M5FullInfoModalProps`, `ModalSectionProps`
17. **constants.ts** - Mensajes, labels, constantes
18. **index.ts** - Exportación pública

### Documentación (2)
19. **README.md** - Documentación de uso
20. **EXTRACTION_PLAN_FINAL.md** - Reporte final (después de implementar)

---

## Cambios al Componente Principal

### Antes (290 líneas)
```typescript
// Todo en un archivo:
// - useState hook
// - 3 sub-componentes internos (M5Row, M5Section, IfaceBlock)
// - 1 helper function (detectFamily)
// - 4 secciones de datos renderizadas inline
// - Estilos inline (Tailwind classes)
```

### Después (45 líneas)
```typescript
import { M5FullInfoModalProps } from './types';
import { useCopiedIpState } from './hooks/useCopiedIpState';
import ModalBackdrop from './components/ModalBackdrop';
import ModalHeader from './components/ModalHeader';
import ModalContent from './components/ModalContent';
import EmptyState from './components/EmptyState';
import SystemSection from './components/SystemSection';
import WirelessSection from './components/WirelessSection';
import InterfacesSection from './components/InterfacesSection';
import ServicesSection from './components/ServicesSection';
import { modalContainerStyles } from './utils/styles';

export default function M5FullInfoModal({ dev, onClose }: M5FullInfoModalProps) {
  const { copiedIp, copyIp } = useCopiedIpState(dev.ip);
  const s = dev.cachedStats;

  return (
    <div className={modalContainerStyles.container} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={modalContainerStyles.modal}>
        <ModalHeader dev={dev} copiedIp={copiedIp} copyIp={copyIp} onClose={onClose} />
        <ModalContent>
          {!s ? (
            <EmptyState />
          ) : (
            <>
              <SystemSection s={s} family={detectFamily(dev)} />
              <WirelessSection s={s} family={detectFamily(dev)} />
              <InterfacesSection s={s} />
              <ServicesSection s={s} />
            </>
          )}
        </ModalContent>
      </div>
    </div>
  );
}
```

---

## Beneficios de la Extracción

| Aspecto | Antes | Después |
|--------|-------|---------|
| Tamaño archivo principal | 290 líneas | 45 líneas |
| Sub-componentes | 3 (internos) | 11 (modular) |
| Archivos | 1 | 20 |
| Mantenibilidad | Difícil (todo mezclado) | Fácil (separado por responsabilidad) |
| Reutilización | No (componentes internos) | Sí (componentes modulares) |
| Testabilidad | Baja | Alta |
| Hook reutilizable | No | Sí (`useCopiedIpState`) |

---

## Cambios de Lógica: NINGUNO

✅ **Garantías**:
- Comportamiento idéntico
- Props sin cambios
- Estado sin cambios
- Renderización sin cambios
- Estilos sin cambios
- Imports de otros archivos funcionan igual

---

## Archivos que Importan M5FullInfoModal

```bash
grep -r "M5FullInfoModal" src --include="*.tsx" --include="*.ts"
```

**Impacto**: Todos continúan funcionando con `import M5FullInfoModal from '../Common/M5FullInfoModal'` gracias a `index.ts`

---

## Plan de Implementación

**Paso 1**: User aprueba este plan ✓ (PENDIENTE)
**Paso 2**: Crear estructura de carpetas y archivos
**Paso 3**: Implementar según plan
**Paso 4**: Verificar TypeScript compilation
**Paso 5**: Crear EXTRACTION_PLAN_FINAL.md con comparativa
**Paso 6**: Eliminar archivo original M5FullInfoModal.tsx

---

## Preguntas de Validación

- [ ] ¿Están correctas las secciones identificadas?
- [ ] ¿Debería haber más sub-componentes?
- [ ] ¿Las funciones de formato necesitan ir en utilities?
- [ ] ¿El hook `useCopiedIpState` es necesario o está bien inline?

**Espera aprobación del usuario para proceder con la implementación**
