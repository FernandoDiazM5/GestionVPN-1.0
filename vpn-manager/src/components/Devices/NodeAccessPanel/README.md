# NodeAccessPanel Component

**Estado**: ✅ Refactorizado a Custom Hooks  
**Líneas**: 836 (componente principal)  
**Responsabilidad**: Gestión completa de nodos VPN y WireGuard  
**Fecha última actualización**: 2026-05-30

---

## 📖 Introducción Rápida

`NodeAccessPanel.tsx` es el componente principal para la pestaña **"Nodos"** de la aplicación VPN Manager. Maneja:

- **Listado y filtrado de nodos VPN**
- **Conexión/desconexión de nodos**
- **Gestión de peers WireGuard**
- **Configuración del servidor VPN**
- **Importación/exportación de datos**
- **Tags y metadatos de nodos**

## 🎯 Arquitectura

```
NodeAccessPanel.tsx (836 líneas)
├── 8 Custom Hooks (~600 líneas)
│   ├── useToasts.ts (19)
│   ├── useNodeModals.ts (29)
│   ├── useNodeTags.ts (32)
│   ├── useServerSettings.ts (42)
│   ├── useWireGuardState.ts (43)
│   ├── useNodeState.ts (54)
│   ├── useNodeFetching.ts (157)
│   └── useWireGuardPeers.ts (157)
│
├── 8 Modales (./modals/)
│   ├── NuevoNodo.tsx
│   ├── EditarNodo.tsx
│   ├── EliminarNodo.tsx
│   ├── NuevoAdmin.tsx
│   ├── BatchCsvModal.tsx
│   ├── ScriptModal.tsx
│   ├── HistoryModal.tsx
│   └── TagModal.tsx
│
├── Utilidades (./utils/)
│   ├── types.ts
│   ├── subnet.ts
│   ├── password.ts
│   └── countdown.ts
│
└── Componentes (./components/)
    └── ProvisionSteps.tsx
```

**Principio**: Separación de responsabilidades
- **Hooks**: Lógica y estado
- **Componente**: Orquestación y renderizado
- **Modales**: Interfaces de usuario especializadas
- **Utilidades**: Funciones compartidas

---

## 🚀 Primeros Pasos

### 1. Entender la estructura
Empieza por leer los archivos en este orden:
1. **README.md** ← Estás aquí
2. **📋_ESTRUCTURA_Y_DOCUMENTACION.md** ← Detalles completos
3. **🔍_MAPA_RAPIDO_REFERENCIAS.md** ← Búsquedas rápidas
4. **📊_DIAGRAMAS_FLUJO.md** ← Visualizaciones

### 2. Explorar el código
```
NodeAccessPanel.tsx (línea 66+)
  ├─ Líneas 1-49: Imports
  ├─ Líneas 54-64: Componente CountdownDisplay
  ├─ Líneas 66-128: Inicialización de hooks
  ├─ Líneas 130-150: Handlers
  └─ Líneas 150+: JSX y renderizado
```

### 3. Compilar y probar
```bash
cd src/components/Devices/NodeAccessPanel
npx tsc --noEmit                    # Verificar tipos
npm run dev                         # Ejecutar en desarrollo
```

---

## 🎣 Los 8 Hooks (resumido)

| Hook | Responsabilidad | Líneas |
|------|-----------------|--------|
| **useToasts** | Notificaciones | 19 |
| **useNodeModals** | Estados de 8 modales | 29 |
| **useNodeTags** | Gestión de tags | 32 |
| **useServerSettings** | Config del servidor WG | 42 |
| **useWireGuardState** | Estado de peers WG | 43 |
| **useNodeState** | Estado de nodos | 54 |
| **useNodeFetching** | Obtención y polling de nodos | 157 |
| **useWireGuardPeers** | Operaciones WireGuard | 157 |

**Patrón**: Cada hook es independiente y reutilizable en otros componentes.

---

## 💾 Flujo de Datos

```
VPN Context (Global)
    ↓
NodeAccessPanel Component
    ├─ 8 Custom Hooks (estado local)
    ├─ Handlers (lógica)
    └─ JSX (renderizado)
         ↓
    APIs REST & Local Storage
```

**Datos fluyen**:
- Descendente: Context → Hooks → Component → JSX
- Ascendente: User events → Handlers → Setters → Re-render

---

## 🎨 Interfaz de Usuario

### Secciones principales

1. **Barra de Control**
   - Botón de refresh
   - Búsqueda de nodos
   - Ordenamiento (por defecto/conectados/desconectados)
   - Botón "Nuevo Nodo"

2. **Indicadores de Estado**
   - Mensajes de error
   - Alertas de renovación
   - Spinners de carga

3. **Listado de Nodos**
   - Cards dinámicas con NodeCard
   - Filtrado por búsqueda en tiempo real
   - Ordenamiento interactivo

4. **Panel WireGuard**
   - Configuración del servidor (IP, puerto, clave pública)
   - Tabla de peers con acciones
   - Herramientas de administrador

5. **Modales Condicionales**
   - 8 modales diferentes
   - Abiertos/cerrados según estado

6. **Notificaciones**
   - Toast messages en esquina
   - Auto-desaparecen después de X segundos

---

## 🔄 Ciclos Automáticos

### Polling de Nodos (cada 60 segundos)
```
silentPoll() ejecuta
  ├─ fetchNodes() → API call
  ├─ Detecta cambios (desconexiones/reconexiones)
  ├─ Actualiza estado
  └─ Muestra notificaciones si aplica
```

### Renovación de Túnel (cada 10 segundos)
```
Check tunnelExpiry
  ├─ Si < 2 minutos
  │  └─ Mostrar warning
  └─ Si expirado
     └─ Alertar user
```

### Auto-sync al montar (después de 2 segundos)
```
useNodeFetching init
  └─ Espera 2s → fetchNodes() → Obtener datos iniciales
```

---

## 🛠️ Common Tasks

### Agregar una notificación
```typescript
addToast('Tu mensaje aquí', 'info');    // info o warn
```

### Abrir un modal
```typescript
setShowNuevoNodo(true);  // Abre modal NuevoNodo
setEditNode(nodo);       // Abre modal EditarNodo
```

### Exportar datos
```typescript
exportCsv();  // Descarga CSV con todos los nodos
```

### Recargar nodos manualmente
```typescript
await handleLoadNodes();  // Obtiene lista fresca del API
```

### Copiar configuración WireGuard
```typescript
copyWgConfig(peerAddress);  // Copia config al portapapeles
```

---

## 🐛 Debugging

### "La UI no se actualiza"
- Verifica que el setter está siendo llamado
- Revisa que el estado está siendo inicializado en el hook
- Usa React DevTools para inspeccionar estado

### "El modal no aparece"
- Verifica el estado de visibilidad en `useNodeModals()`
- Revisa que el modal está siendo renderizado condicionalmente
- Comprueba que el setter está siendo llamado

### "El polling no funciona"
- Abre DevTools Console y revisa si hay errores
- Verifica credenciales en context
- Comprueba que `fetchNodes()` está retornando datos

### "La API no responde"
- Verifica que credentials son correctas
- Revisa el endpoint en `API_BASE_URL`
- Comprueba la respuesta en Network tab

---

## 📋 Archivos de Documentación Incluidos

1. **📋_ESTRUCTURA_Y_DOCUMENTACION.md**
   - Documentación detallada de cada hook
   - Explicación de cada sección del código
   - Ciclo de vida completo
   - Guía de mantenimiento

2. **🔍_MAPA_RAPIDO_REFERENCIAS.md**
   - Búsquedas rápidas por función
   - Índice de estados y setters
   - Tabla de modales
   - Quick tips para desarrolladores

3. **📊_DIAGRAMAS_FLUJO.md**
   - Visualizaciones de arquitectura
   - Flujos de datos
   - Diagramas de interacción
   - Ejemplos completos end-to-end

4. **README.md** ← Este archivo
   - Introducción rápida
   - Guía de primeros pasos
   - Common tasks
   - Debugging

---

## ✅ Checklist de Integración

Antes de hacer cambios, asegúrate de:

- [ ] Entender qué hace cada hook
- [ ] Saber dónde está el estado que necesitas
- [ ] Verificar que los tipos TypeScript son correctos
- [ ] Compilar sin errores: `npx tsc --noEmit`
- [ ] Probar en navegador (hard refresh)
- [ ] Revisar console del navegador
- [ ] Verificar Network tab para API calls

---

## 🚨 Notas Importantes

### ⚠️ No modificar comportamiento
```
El código está refactorizado para mantener:
- 100% funcionalidad idéntica
- Mismo comportamiento de usuario
- Sin cambios visuales
- Same performance characteristics
```

### 💡 Reutilizar hooks
```
Todos los hooks son independientes y pueden
ser usados en otros componentes:

import { useToasts, useNodeModals } from './NodeAccessPanel/hooks';
```

### 🔒 Mantener separación
```
Cada hook tiene una responsabilidad única.
Evita mezclar responsabilidades o crear
dependencias circulares entre hooks.
```

---

## 📞 Contacto / Ayuda

Si tienes preguntas:
1. Revisa **📋_ESTRUCTURA_Y_DOCUMENTACION.md**
2. Busca en **🔍_MAPA_RAPIDO_REFERENCIAS.md**
3. Visualiza en **📊_DIAGRAMAS_FLUJO.md**
4. Revisa el código comentado

---

## 📊 Estadísticas

```
Component:          NodeAccessPanel.tsx
Total lines:        836
├─ Imports:         ~50 líneas
├─ Initialization:  ~80 líneas
├─ Logic:           ~20 líneas
└─ JSX:            ~676 líneas

Custom Hooks:       8 hooks
├─ Simple:          6 hooks (~248 líneas)
└─ Complex:         2 hooks (~314 líneas)

Modals:            8 archivos
APIs used:         3+ endpoints
Dependencies:      React, Lucide, Custom hooks
```

---

## 🎓 Aprender Más

Para entender los conceptos:

1. **React Hooks Basics** → useState, useEffect, useRef, useCallback
2. **React Context** → useVpn() provider y consumer
3. **Custom Hooks Pattern** → Extraer lógica en hooks reutilizables
4. **TypeScript** → Interfaces, tipos para props y estado
5. **Async/Await** → API calls y promises

---

## 🔗 Referencias Rápidas

- Componente principal: `./NodeAccessPanel.tsx`
- Hooks: `./hooks/`
- Modales: `./modals/`
- Utilidades: `./utils/`
- Documentación: `./📋_*.md`

---

**Última actualización**: 2026-05-30  
**Versión**: 1.0 (Refactorizado a Hooks)  
**Estado**: ✅ Producción  
**Compatibilidad**: React 18+, TypeScript 4.8+

---

**Recuerda**: Este código funciona perfectamente como está. La documentación es para entender cómo y por qué está organizado así.

