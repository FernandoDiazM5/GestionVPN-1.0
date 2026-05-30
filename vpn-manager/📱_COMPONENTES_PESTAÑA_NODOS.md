# 📱 Componentes de la Pestaña "Nodos"

**Documento**: Análisis de estructura de componentes  
**Pestaña**: Nodos (activeModule === 'nodes')  
**Actualizado**: 2026-05-30

---

## 🏗️ Jerarquía de Componentes

```
App.tsx
└── VpnProvider (Context provider)
    └── AppContent
        └── NodeAccessPanel (Componente principal)
            ├── Modales
            │   ├── NuevoNodo.tsx (Crear nodo)
            │   ├── EditarNodo.tsx (Editar nodo)
            │   ├── EliminarNodo.tsx (Eliminar nodo)
            │   ├── NuevoAdmin.tsx (Crear admin)
            │   ├── BatchCsvModal.tsx (Importar CSV)
            │   ├── TagModal.tsx (Gestionar etiquetas)
            │   ├── HistoryModal.tsx (Historial)
            │   └── ScriptModal.tsx (Scripts)
            │
            ├── Componentes secundarios
            │   ├── ProvisionSteps.tsx (Mostrar pasos)
            │   └── NodeCard (Tarjeta de nodo - VPN/NodeCard)
            │
            ├── Utils
            │   ├── formatters.ts (Formateo de datos)
            │   ├── nodeValidation.ts (Validación)
            │   └── passwordGenerator.ts (Generador de contraseñas)
            │
            ├── Hooks propios
            │   ├── useNodePolling.ts (Polling de nodos)
            │   └── useWireGuardPeers.ts (Peers de WG)
            │
            └── Contexto
                └── useVpn (VpnContext)
```

---

## 📋 Componentes Principales

### 1. **NodeAccessPanel** (Principal)
**Ubicación**: `src/components/Devices/NodeAccessPanel/NodeAccessPanel.tsx`

**Responsabilidad**:
- Gestión completa de nodos VRF
- Pantalla de provisión de nodos
- Control de creación, edición, eliminación
- Gestión de subredes y WireGuard

**Características**:
```typescript
- Estados de nodos (activos, inactivos)
- Visualización de tarjetas de nodos (NodeCard)
- Diálogos modales para operaciones
- Validación de subredes y overlaps
- Provisión paso a paso con animaciones
- Copia de credenciales con feedback visual
```

---

## 🗂️ Modales (Diálogos Secundarios)

Todos ubicados en: `src/components/Devices/NodeAccessPanel/modals/`

### **1. NuevoNodo.tsx** (Crear nodo)
```
Responsabilidad: Formulario para crear nuevos nodos
Campos:
  - Nombre del nodo
  - VRF único
  - Subredes locales
  - Configuración WireGuard

Acciones:
  - Validación de subredes
  - Prevención de overlaps
  - Provisión automática
```

### **2. EditarNodo.tsx** (Editar nodo)
```
Responsabilidad: Modificar configuración de nodos existentes
Campos:
  - Nombre (editable)
  - Subredes (editable)
  - Estado activo/inactivo

Acciones:
  - Validación de cambios
  - Actualización de BD
```

### **3. EliminarNodo.tsx** (Eliminar nodo)
```
Responsabilidad: Eliminar nodos con confirmación
Acciones:
  - Confirmación de eliminación
  - Deprovisión automática
  - Limpieza de BD
```

### **4. NuevoAdmin.tsx** (Crear admin)
```
Responsabilidad: Crear usuarios administradores
Campos:
  - Usuario
  - Contraseña (generada)
  - Rol (admin/user)

Acciones:
  - Generación de contraseña
  - Creación en BD
```

### **5. BatchCsvModal.tsx** (Importar CSV)
```
Responsabilidad: Importar múltiples nodos desde CSV
Campos:
  - Archivo CSV
  - Validación de estructura

Acciones:
  - Parseo de CSV
  - Creación en lote
  - Reporte de errores
```

### **6. TagModal.tsx** (Etiquetas)
```
Responsabilidad: Gestionar etiquetas de nodos
Acciones:
  - Crear etiquetas
  - Asignar a nodos
  - Filtrado por etiqueta
```

### **7. HistoryModal.tsx** (Historial)
```
Responsabilidad: Ver historial de cambios
Contenido:
  - Operaciones realizadas
  - Timestamps
  - Usuario que realizó cambio
```

### **8. ScriptModal.tsx** (Scripts)
```
Responsabilidad: Mostrar scripts de instalación
Contenido:
  - Script para cliente
  - Script para servidor
  - Comandos de instalación
```

---

## 🎨 Componentes Secundarios

### **ProvisionSteps.tsx**
**Ubicación**: `src/components/Devices/NodeAccessPanel/components/ProvisionSteps.tsx`

```
Responsabilidad: Mostrar pasos de provisión con animación
Características:
  - Lista de pasos ejecutados
  - Estado OK/ERROR de cada paso
  - Animación progresiva
  - Información detallada del error (si aplica)

Props:
  - steps: ProvisionStep[]
  - failedAt?: number
  - visible: number (pasos a mostrar)
```

### **NodeCard** (Tarjeta de nodo)
**Ubicación**: `src/components/VPN/NodeCard/NodeCard.tsx`

```
Responsabilidad: Mostrar información de un nodo
Características:
  - Estado del nodo (activo/inactivo)
  - IP del nodo
  - Subredes asignadas
  - Botones de acción (editar, eliminar, activar)
  - Contador de tiempo activo
  - Status de conexión

Props:
  - node: NodeInfo
  - onEdit: () => void
  - onDelete: () => void
  - onActivate: () => void
```

**Sub-componentes de NodeCard**:
- `useNodeActivation.ts` - Hook para activación
- `useTunnelCountdown.ts` - Hook para contador de tiempo

---

## 🔗 Hooks Personalizados

### **useNodePolling.ts**
```typescript
// Polling automático para obtener estado de nodos
const { nodes, loading, error, refetch } = useNodePolling();

// Actualiza cada X segundos
// Detecta cambios en estado de nodos
```

### **useWireGuardPeers.ts**
```typescript
// Obtiene peers de WireGuard
const { peers, loading } = useWireGuardPeers(nodeId);

// Sincroniza con servidor
// Actualiza conexiones activas
```

---

## 📊 Flujo de Datos

```
VpnContext (useVpn)
    ↓
NodeAccessPanel
    ├── Lee: nodes[], activeNodeVrf, credentials
    ├── Lee: TUNNEL_TIMEOUT_MS (30 min)
    ├── Lee: API_BASE_URL
    │
    ├→ Modales (NuevoNodo, Editar, Eliminar)
    │   └→ Actualizan contexto via VpnContext
    │
    ├→ NodeCard (renderiza nodos)
    │   ├→ useNodeActivation (activar/desactivar)
    │   └→ useTunnelCountdown (mostrar tiempo)
    │
    ├→ useNodePolling (obtiene estado)
    │
    └→ APIs
        ├→ POST /api/node/create
        ├→ PUT /api/node/update
        ├→ DELETE /api/node/delete
        ├→ POST /api/node/activate
        └→ POST /api/node/provision
```

---

## 🎯 Información que Usa del Contexto

```typescript
const {
  // Autenticación
  credentials,           // Usuario, password, IP del servidor
  
  // Nodos
  nodes,                 // Array de NodeInfo
  activeNodeVrf,         // VRF del nodo activo
  setActiveNodeVrf,      // Setter para nodo activo
  tunnelExpiry,          // Tiempo de expiración del túnel
  setTunnelExpiry,       // Setter para expiración
  adminIP,               // IP del servidor VPS
  deactivateAllNodes,    // Función para desactivar todos
  removeNodeFromState,   // Función para remover nodo
  
  // Constantes
  TUNNEL_TIMEOUT_MS,     // 30 minutos (del context)
} = useVpn();
```

---

## 📱 UI/UX Elements

### Buttons
```
- "Crear Nodo" (Plus icon)
- "Eliminar Nodo" (Trash icon)
- "Editar" (Pencil icon)
- "Crear Admin" (UserPlus icon)
- "Importar CSV" (Upload icon)
- "Ver Script" (FileCode icon)
- "Ver Historial" (History icon)
```

### Icons (Lucide React)
```
- Radio: Para nodos
- Shield: Para seguridad
- Wifi: Para conexión
- AlertCircle: Para errores
- CheckCircle2: Para éxito
- Clock: Para tiempo
- Eye/EyeOff: Para contraseña
- Copy: Para copiar
- Download: Para descargar
- ArrowUpDown: Para ordenar
- Tag: Para etiquetas
```

### Estados Visuales
```
- Activo: Verde (bg-emerald)
- Error: Rojo (bg-rose)
- Advertencia: Ámbar (bg-amber)
- Info: Azul (bg-indigo)
- Cargando: Spinner animation
```

---

## 🔄 Operaciones Principales

| Operación | Componente | API | Estado |
|-----------|-----------|-----|--------|
| **Crear Nodo** | NuevoNodo.tsx | POST /api/node/create | Contextualizado |
| **Editar Nodo** | EditarNodo.tsx | PUT /api/node/update | Contextualizado |
| **Eliminar Nodo** | EliminarNodo.tsx | DELETE /api/node/delete | Contextualizado |
| **Activar Nodo** | NodeCard.tsx | POST /api/node/activate | Via VpnContext |
| **Desactivar Todos** | NodeAccessPanel.tsx | Interno | Contextualizado |
| **Crear Admin** | NuevoAdmin.tsx | POST /api/user/create | Contextualizado |
| **Importar CSV** | BatchCsvModal.tsx | POST /api/node/batch | Contextualizado |

---

## 🎓 Dependencias

```typescript
// Contexto
import { useVpn, TUNNEL_TIMEOUT_MS } from './context';

// APIs
import { apiFetch } from './utils/apiClient';
import { fetchWithTimeout } from './utils/fetchWithTimeout';

// Tipos
import type { NodeInfo, WgPeer } from './types/api';

// Base de datos
import { deviceDb } from './store/deviceDb';
import { cpeCache } from './store/cpeCache';

// Icons (Lucide React)
import { Radio, ShieldCheck, Wifi, Plus, Trash2, ... } from 'lucide-react';
```

---

## 📝 Resumen

**La pestaña "Nodos" es un módulo completo de gestión de nodos VRF con**:
- ✅ Creación, edición, eliminación de nodos
- ✅ Importación en lote (CSV)
- ✅ Gestión de subredes y validación
- ✅ Provisión automática paso a paso
- ✅ Sincronización con contexto global
- ✅ Polling automático de estado
- ✅ Gestión de WireGuard peers
- ✅ Historial de cambios
- ✅ Generación de scripts
- ✅ Manejo de etiquetas

**Todo orquestado a través del VpnContext refactorizado** ✅

