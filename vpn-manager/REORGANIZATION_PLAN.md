# 📁 Plan de Reorganización de Archivos - Frontend vpn-manager

**Objetivo:** Reorganizar estructura de archivos SIN modificar código  
**Alcance:** Solo movimientos de carpetas y archivos  
**Impacto en Código:** CERO - Solo imports cambian  
**Tiempo Estimado:** 30-45 minutos  
**Estado:** Listo para implementar

---

## 📋 Tabla de Contenidos

1. [Problemas Identificados](#problemas-identificados)
2. [Nueva Estructura Propuesta](#nueva-estructura-propuesta)
3. [Plan de Migración Paso a Paso](#plan-de-migración-paso-a-paso)
4. [Cambios de Imports](#cambios-de-imports)
5. [Checklist de Implementación](#checklist-de-implementación)

---

## 🔴 Problemas Identificados

### 1. **Archivos .js en carpeta src/components/**

**Problema:**
```
src/components/
├── routeros.service.js    ❌ Servicio JavaScript puro
└── ubiquiti.service.js    ❌ Servicio JavaScript puro
```

**Por qué es problema:**
- Servicios (no componentes) no deberían estar en `components/`
- Dificulta encontrar código reutilizable
- Confunde la estructura (components vs services)
- Incumple convención de directorios

**Solución:** Mover a `src/utils/` o `src/services/`

---

### 2. **Componentes Grandes sin Sub-carpetas**

**Problema:**
```
src/components/
├── NodeCard.tsx           (800 líneas - MONOLÍTICO)
├── NetworkDevicesModule.tsx (750+ líneas)
├── ApMonitorModule.tsx    (650+ líneas)
└── ... 10 más archivos sueltos
```

**Por qué es problema:**
- Componentes grandes están en archivo único
- Si hubiera sub-componentes, no tienen lugar
- Difícil encontrar partes relacionadas
- Todos los imports apuntan a `.tsx` sueltos

**Solución:** Crear subcarpetas lógicas (sin cambiar código aún)

---

### 3. **Falta de Organización por Dominio**

**Problema:**
```
Componentes relacionados a VPN están dispersos:
├── NodeCard.tsx
├── VpnCard.tsx
├── NodeProvisionForm.tsx
├── NodeAccessPanel.tsx
├── ScannerModule.tsx
(Todos sueltos)
```

**Solución:** Agrupar por dominio/función:
```
components/
├── VPN/              (Gestión de tuneles)
├── Devices/          (Escaneo y dispositivos)
├── Monitor/          (Monitoreo AP)
├── Settings/         (Configuración)
└── Common/           (Compartidos)
```

---

### 4. **Componentes de Tipos Dispersos**

**Problema:**
```
src/types/
├── api.ts           (108 líneas)
├── devices.ts       (249 líneas)
└── apMonitor.ts     (157 líneas)
(Sin organización clara por dominio)
```

**Solución:** Agrupar por características relacionadas

---

### 5. **Sin Documentación en Carpetas**

**Problema:**
- No hay `README.md` explicando qué contiene cada carpeta
- Difícil para nuevos desarrolladores
- No hay guía de cómo agregar archivos

**Solución:** Crear `README.md` en cada carpeta importante

---

## 📂 Nueva Estructura Propuesta

### Antes (Actual - Desorganizado)

```
src/
├── components/
│   ├── ApMonitorModule.tsx          (650+ líneas)
│   ├── NetworkDevicesModule.tsx     (750+ líneas)
│   ├── NodeCard.tsx                 (800 líneas)
│   ├── NodeProvisionForm.tsx        (393 líneas)
│   ├── VpnCard.tsx                  (290 líneas)
│   ├── ScannerModule.tsx            (244 líneas)
│   ├── UserManagementModule.tsx     (244 líneas)
│   ├── RouterAccess.tsx             (196 líneas)
│   ├── SettingsModule.tsx           (153 líneas)
│   ├── NodeAccessPanel.tsx          (componente)
│   ├── ConfirmModal.tsx             (modal)
│   ├── M5FullInfoModal.tsx          (modal)
│   ├── DeviceCard.tsx               (tarjeta)
│   ├── routeros.service.js          ❌ MOVER
│   └── ubiquiti.service.js          ❌ MOVER
│
├── context/
│   └── VpnContext.tsx
│
├── store/
│   ├── db.ts
│   ├── deviceDb.ts
│   └── cpeCache.ts
│
├── types/
│   ├── api.ts
│   ├── devices.ts
│   └── apMonitor.ts
│
├── utils/
│   ├── apiClient.ts
│   ├── crypto.ts
│   └── fetchWithTimeout.ts
│
├── App.tsx
├── App.css
├── main.tsx
├── index.css
└── config.ts
```

### Después (Propuesto - Organizado)

```
src/
├── components/                          # Componentes por dominio
│   ├── README.md                        📄 NUEVO
│   │
│   ├── Common/                          📁 NUEVO - Compartidos
│   │   ├── README.md
│   │   ├── ConfirmModal.tsx
│   │   ├── M5FullInfoModal.tsx
│   │   └── DeviceCard.tsx
│   │
│   ├── VPN/                             📁 NUEVO - Gestión VPN
│   │   ├── README.md
│   │   ├── NodeCard.tsx                 (mover)
│   │   ├── VpnCard.tsx                  (mover)
│   │   └── NodeProvisionForm.tsx        (mover)
│   │
│   ├── Devices/                         📁 NUEVO - Dispositivos
│   │   ├── README.md
│   │   ├── NetworkDevicesModule.tsx     (mover)
│   │   ├── ScannerModule.tsx            (mover)
│   │   └── NodeAccessPanel.tsx          (mover)
│   │
│   ├── Monitor/                         📁 NUEVO - Monitoreo
│   │   ├── README.md
│   │   └── ApMonitorModule.tsx          (mover)
│   │
│   ├── Settings/                        📁 NUEVO - Configuración
│   │   ├── README.md
│   │   ├── SettingsModule.tsx           (mover)
│   │   └── UserManagementModule.tsx     (mover)
│   │
│   └── Auth/                            📁 NUEVO - Autenticación
│       ├── README.md
│       └── RouterAccess.tsx             (mover)
│
├── context/                             # Global state
│   ├── README.md                        📄 NUEVO
│   └── VpnContext.tsx
│
├── store/                               # Persistencia local
│   ├── README.md                        📄 NUEVO
│   ├── db.ts
│   ├── deviceDb.ts
│   └── cpeCache.ts
│
├── types/                               # Tipos TypeScript
│   ├── README.md                        📄 NUEVO
│   ├── api.ts
│   ├── devices.ts
│   └── apMonitor.ts
│
├── utils/                               # Utilidades
│   ├── README.md                        📄 NUEVO
│   ├── services/                        📁 NUEVO
│   │   ├── README.md
│   │   ├── routeros.service.js          (mover)
│   │   └── ubiquiti.service.js          (mover)
│   │
│   ├── apiClient.ts
│   ├── crypto.ts
│   └── fetchWithTimeout.ts
│
├── App.tsx
├── App.css
├── main.tsx
├── index.css
└── config.ts
```

---

## 🚀 Plan de Migración Paso a Paso

### FASE 1: Crear Nueva Estructura de Carpetas

**Paso 1.1:** Crear carpeta para componentes comunes

```bash
mkdir -p src/components/Common
mkdir -p src/components/VPN
mkdir -p src/components/Devices
mkdir -p src/components/Monitor
mkdir -p src/components/Settings
mkdir -p src/components/Auth
```

**Paso 1.2:** Crear carpeta para servicios

```bash
mkdir -p src/utils/services
```

**Paso 1.3:** Crear README.md en directorios nuevos

(Se detallan en FASE 3)

---

### FASE 2: Mover Archivos (SIN Cambios de Código)

#### 2.1 Mover componentes comunes

```bash
# Componentes reutilizables a Common/
mv src/components/ConfirmModal.tsx src/components/Common/
mv src/components/M5FullInfoModal.tsx src/components/Common/
mv src/components/DeviceCard.tsx src/components/Common/
```

#### 2.2 Mover componentes de VPN

```bash
# Gestión de VPN a VPN/
mv src/components/NodeCard.tsx src/components/VPN/
mv src/components/VpnCard.tsx src/components/VPN/
mv src/components/NodeProvisionForm.tsx src/components/VPN/
```

#### 2.3 Mover componentes de Dispositivos

```bash
# Escaneo y dispositivos a Devices/
mv src/components/NetworkDevicesModule.tsx src/components/Devices/
mv src/components/ScannerModule.tsx src/components/Devices/
mv src/components/NodeAccessPanel.tsx src/components/Devices/
```

#### 2.4 Mover componentes de Monitor

```bash
# Monitoreo a Monitor/
mv src/components/ApMonitorModule.tsx src/components/Monitor/
```

#### 2.5 Mover componentes de Settings

```bash
# Configuración a Settings/
mv src/components/SettingsModule.tsx src/components/Settings/
mv src/components/UserManagementModule.tsx src/components/Settings/
```

#### 2.6 Mover componentes de Auth

```bash
# Autenticación a Auth/
mv src/components/RouterAccess.tsx src/components/Auth/
```

#### 2.7 Mover servicios

```bash
# Servicios a utils/services/
mv src/components/routeros.service.js src/utils/services/
mv src/components/ubiquiti.service.js src/utils/services/
```

---

### FASE 3: Crear Documentación (README.md)

#### 3.1 `src/components/README.md`

```markdown
# Components Directory

## Estructura

Componentes React agrupados por dominio funcional.

### Directorios

- **Common/** - Componentes compartidos (modales, tarjetas genéricas)
- **VPN/** - Gestión de tuneles VPN (SSTP, WireGuard, PTP)
- **Devices/** - Escaneo y descubrimiento de dispositivos
- **Monitor/** - Monitoreo en tiempo real de Access Points
- **Settings/** - Configuración del sistema y gestión de usuarios
- **Auth/** - Autenticación y login

## Patrón de Componentes

Cada componente es auto-contenido:
- useState para estado local
- useVpn() para estado global
- API calls integradas
- Estilos Tailwind CSS

## Agregar Nuevo Componente

1. Crear archivo .tsx en carpeta correspondiente
2. Exportar como default
3. Importar en App.tsx si es módulo principal
```

#### 3.2 `src/components/Common/README.md`

```markdown
# Common Components

Componentes reutilizables en toda la aplicación.

## Contenido

- **ConfirmModal.tsx** - Modal de confirmación genérico
- **M5FullInfoModal.tsx** - Modal con información ampliada
- **DeviceCard.tsx** - Tarjeta individual de dispositivo

## Uso

```tsx
import ConfirmModal from '@/components/Common/ConfirmModal';

<ConfirmModal 
  title="Confirmar"
  message="¿Estás seguro?"
  onConfirm={handleConfirm}
  onCancel={handleCancel}
/>
```
```

#### 3.3 `src/components/VPN/README.md`

```markdown
# VPN Components

Gestión de tuneles VPN.

## Contenido

- **NodeCard.tsx** (800 líneas) - Tarjeta de nodo VPN
- **VpnCard.tsx** - Tarjeta de tunel VPN
- **NodeProvisionForm.tsx** - Formulario de aprovisionamiento

## Nota

NodeCard.tsx es el componente más grande. Si excede 1000 líneas,
considerar refactorización en:
- NodeCardHeader
- NodeCardBody
- NodeCardActions
```

#### 3.4 `src/components/Devices/README.md`

```markdown
# Devices Components

Escaneo y descubrimiento de dispositivos.

## Contenido

- **NetworkDevicesModule.tsx** (750+ líneas) - Módulo principal de scan
- **ScannerModule.tsx** - Control de escaneo
- **NodeAccessPanel.tsx** - Panel de acceso a nodos

## Flujo de Scan

1. Usuario click botón "Escanear"
2. POST /api/device/scan
3. Progreso mostrado en tiempo real
4. Resultados guardados en deviceDb
5. NetworkDevicesModule renderiza tabla
```

#### 3.5 `src/components/Monitor/README.md`

```markdown
# Monitor Components

Monitoreo en tiempo real de Access Points.

## Contenido

- **ApMonitorModule.tsx** (650+ líneas) - Dashboard AP

## Características

- Polling automático cada 5-30 segundos
- Métricas en vivo (señal, tráfico, CCQ)
- Listado de estaciones conectadas
- Gráficos de tendencias
```

#### 3.6 `src/components/Settings/README.md`

```markdown
# Settings Components

Configuración del sistema.

## Contenido

- **SettingsModule.tsx** - Configuración de credenciales MikroTik
- **UserManagementModule.tsx** - CRUD de usuarios
```

#### 3.7 `src/components/Auth/README.md`

```markdown
# Auth Components

Autenticación y acceso.

## Contenido

- **RouterAccess.tsx** - Login inicial, credenciales MikroTik

## Flujo

1. Mostrar formulario de login
2. Usuario ingresa host, usuario, contraseña
3. VpnContext.handleLoginSuccess()
4. Token guardado + credenciales cifradas
5. App renderiza módulos
```

#### 3.8 `src/utils/README.md`

```markdown
# Utils Directory

Funciones reutilizables y servicios.

## Subdirectorios

### services/
Servicios especializados que comunican con dispositivos de red:
- routeros.service.js - Integración con RouterOS
- ubiquiti.service.js - Integración con Ubiquiti airOS

## Archivos Principales

- **apiClient.ts** - HTTP client con JWT integrado
- **crypto.ts** - Cifrado de credenciales
- **fetchWithTimeout.ts** - Fetch robusto con timeout

## Agregar Nueva Utilidad

1. Crear archivo .ts en utils/
2. Exportar funciones
3. Documentar uso en comentarios
```

#### 3.9 `src/utils/services/README.md`

```markdown
# Services Directory

Servicios especializados que integran con dispositivos de red.

## Contenido

- **routeros.service.js** - API RouterOS (node-routeros)
- **ubiquiti.service.js** - SSH a routers Ubiquiti airOS

## Nota

Estos servicios son JavaScript puro (no TypeScript) porque
interactúan directamente con librerías no tipadas.

## Uso

Estos servicios son llamados SOLO desde backend.
El frontend no debe importarlos directamente.
```

#### 3.10 `src/context/README.md`

```markdown
# Context Directory

Estado global de la aplicación.

## Contenido

- **VpnContext.tsx** - Estado compartido (autenticación, nodos, etc)

## Hook de Uso

```tsx
import { useVpn } from '@/context/VpnContext';

const { isAuthenticated, nodes, activeModule } = useVpn();
```

## Qué Debe Estar Aquí

- Autenticación
- Nodos VPN activos
- Módulo activo
- Preferencias globales

## Qué NO Debe Estar Aquí

- Datos temporales (usar useState en componente)
- Caché (usar store/)
- Lógica de API (usar utils/)
```

#### 3.11 `src/store/README.md`

```markdown
# Store Directory

Persistencia local con Zustand + LocalForage + IndexedDB.

## Contenido

- **db.ts** - Almacenamiento de credenciales cifradas
- **deviceDb.ts** - Caché de dispositivos escaneados
- **cpeCache.ts** - Caché de equipos CPE

## Cuándo Usar Store vs Context

| Necesidad | Usar |
|-----------|------|
| Autenticación | Context |
| Módulo activo | Context |
| Datos que persisten sesión | Store |
| Caché de API | Store |
| Preferencias usuario | Store |
```

#### 3.12 `src/types/README.md`

```markdown
# Types Directory

Contratos TypeScript para API backend.

## Contenido

- **api.ts** - Tipos genéricos de API
- **devices.ts** - Tipos de dispositivos
- **apMonitor.ts** - Tipos de monitoreo AP

## ⚠️ Crítico

Estos tipos DEBEN estar sincronizados con respuestas del backend.

Si backend retorna un nuevo campo:
1. Actualizar tipo aquí
2. TypeScript error en componente que lo usa
3. Componente se actualiza automáticamente

## Ejemplos

```typescript
// api.ts
export interface ApiResponse<T> { ... }

// devices.ts
export interface Device { ... }

// apMonitor.ts
export interface ApMetrics { ... }
```
```

---

### FASE 4: Actualizar Imports

#### 4.1 En `src/App.tsx`

**ANTES:**
```typescript
import RouterAccess from './components/RouterAccess';
import NodeAccessPanel from './components/NodeAccessPanel';
import NetworkDevicesModule from './components/NetworkDevicesModule';
import ApMonitorModule from './components/ApMonitorModule';
import SettingsModule from './components/SettingsModule';
```

**DESPUÉS:**
```typescript
import RouterAccess from './components/Auth/RouterAccess';
import NodeAccessPanel from './components/Devices/NodeAccessPanel';
import NetworkDevicesModule from './components/Devices/NetworkDevicesModule';
import ApMonitorModule from './components/Monitor/ApMonitorModule';
import SettingsModule from './components/Settings/SettingsModule';
```

#### 4.2 En componentes que importan modales

**ANTES:**
```typescript
import ConfirmModal from './ConfirmModal';
import M5FullInfoModal from './M5FullInfoModal';
```

**DESPUÉS (si está en carpeta diferente):**
```typescript
import ConfirmModal from '../Common/ConfirmModal';
import M5FullInfoModal from '../Common/M5FullInfoModal';
```

#### 4.3 En componentes VPN que importan DeviceCard

**ANTES:**
```typescript
import DeviceCard from './DeviceCard';
```

**DESPUÉS:**
```typescript
import DeviceCard from '../Common/DeviceCard';
```

#### 4.4 En NetworkDevicesModule que importa ScannerModule

**ANTES:**
```typescript
import ScannerModule from './ScannerModule';
```

**DESPUÉS (ambos en Devices/):**
```typescript
import ScannerModule from './ScannerModule';  // Sin cambios
```

---

## 📝 Cambios de Imports - Mapa Completo

| Archivo | Import Actual | Import Nuevo | Nota |
|---------|---------------|--------------|------|
| App.tsx | `'./components/RouterAccess'` | `'./components/Auth/RouterAccess'` | En Auth/ |
| App.tsx | `'./components/NodeAccessPanel'` | `'./components/Devices/NodeAccessPanel'` | En Devices/ |
| App.tsx | `'./components/NetworkDevicesModule'` | `'./components/Devices/NetworkDevicesModule'` | En Devices/ |
| App.tsx | `'./components/ApMonitorModule'` | `'./components/Monitor/ApMonitorModule'` | En Monitor/ |
| App.tsx | `'./components/SettingsModule'` | `'./components/Settings/SettingsModule'` | En Settings/ |
| NodeCard.tsx | (si importa modal) | `'../Common/M5FullInfoModal'` | En Common/ |
| NetworkDevicesModule.tsx | `'./DeviceCard'` | `'./DeviceCard'` O `'../Common/DeviceCard'` | Depende ubicación |
| ApMonitorModule.tsx | (si usa algo) | Revisar imports | Verificar |

---

## ✅ Checklist de Implementación

### FASE 1: Preparación
- [ ] Hacer backup de carpeta `src/` (git commit)
- [ ] Abrir terminal en `vpn-manager/`
- [ ] Listar archivos actuales con `ls src/components/`

### FASE 2: Crear Carpetas
- [ ] `mkdir -p src/components/Common`
- [ ] `mkdir -p src/components/VPN`
- [ ] `mkdir -p src/components/Devices`
- [ ] `mkdir -p src/components/Monitor`
- [ ] `mkdir -p src/components/Settings`
- [ ] `mkdir -p src/components/Auth`
- [ ] `mkdir -p src/utils/services`

### FASE 3: Mover Archivos

**Common:**
- [ ] `mv src/components/ConfirmModal.tsx src/components/Common/`
- [ ] `mv src/components/M5FullInfoModal.tsx src/components/Common/`
- [ ] `mv src/components/DeviceCard.tsx src/components/Common/`

**VPN:**
- [ ] `mv src/components/NodeCard.tsx src/components/VPN/`
- [ ] `mv src/components/VpnCard.tsx src/components/VPN/`
- [ ] `mv src/components/NodeProvisionForm.tsx src/components/VPN/`

**Devices:**
- [ ] `mv src/components/NetworkDevicesModule.tsx src/components/Devices/`
- [ ] `mv src/components/ScannerModule.tsx src/components/Devices/`
- [ ] `mv src/components/NodeAccessPanel.tsx src/components/Devices/`

**Monitor:**
- [ ] `mv src/components/ApMonitorModule.tsx src/components/Monitor/`

**Settings:**
- [ ] `mv src/components/SettingsModule.tsx src/components/Settings/`
- [ ] `mv src/components/UserManagementModule.tsx src/components/Settings/`

**Auth:**
- [ ] `mv src/components/RouterAccess.tsx src/components/Auth/`

**Services:**
- [ ] `mv src/components/routeros.service.js src/utils/services/`
- [ ] `mv src/components/ubiquiti.service.js src/utils/services/`

**Verificar (no deben quedar):**
- [ ] `ls src/components/` (verificar que solo carpetas)
- [ ] No debe haber .tsx sueltos en `src/components/`

### FASE 4: Crear README.md
- [ ] `src/components/README.md`
- [ ] `src/components/Common/README.md`
- [ ] `src/components/VPN/README.md`
- [ ] `src/components/Devices/README.md`
- [ ] `src/components/Monitor/README.md`
- [ ] `src/components/Settings/README.md`
- [ ] `src/components/Auth/README.md`
- [ ] `src/context/README.md`
- [ ] `src/store/README.md`
- [ ] `src/types/README.md`
- [ ] `src/utils/README.md`
- [ ] `src/utils/services/README.md`

### FASE 5: Actualizar Imports

**En src/App.tsx:**
- [ ] Cambiar import RouterAccess
- [ ] Cambiar import NodeAccessPanel
- [ ] Cambiar import NetworkDevicesModule
- [ ] Cambiar import ApMonitorModule
- [ ] Cambiar import SettingsModule

**En componentes individuales (si aplica):**
- [ ] Verificar imports entre componentes
- [ ] Actualizar imports relativos
- [ ] Usar `../` para carpetas hermanas
- [ ] Usar `../../` para carpetas padre

### FASE 6: Verificación Final
- [ ] `npm run dev` - Debe compilar sin errores
- [ ] No hay errores de TypeScript
- [ ] No hay console errors en navegador
- [ ] App funciona igual que antes
- [ ] Imports resuelven correctamente
- [ ] Verificar cada módulo (nodes, devices, monitor, settings)

### FASE 7: Git
- [ ] `git status` - Ver todos los cambios
- [ ] `git add -A` - Stage todos los cambios
- [ ] `git commit -m "refactor: reorganizar estructura de componentes"`
- [ ] Crear un commit limpio de reorganización

---

## 🔄 Cómo Ejecutar

### Opción 1: Con Terminal (Recomendado)

```bash
# Abre terminal en: C:\Users\i201720174\Desktop\ProyectoVPN_3.0\vpn-manager

# FASE 1 - Backup (Git)
git status
git add -A
git commit -m "wip: antes de reorganización"

# FASE 2 - Crear carpetas
mkdir -p src/components/Common
mkdir -p src/components/VPN
mkdir -p src/components/Devices
mkdir -p src/components/Monitor
mkdir -p src/components/Settings
mkdir -p src/components/Auth
mkdir -p src/utils/services

# FASE 3 - Mover archivos
mv src/components/ConfirmModal.tsx src/components/Common/
mv src/components/M5FullInfoModal.tsx src/components/Common/
mv src/components/DeviceCard.tsx src/components/Common/

mv src/components/NodeCard.tsx src/components/VPN/
mv src/components/VpnCard.tsx src/components/VPN/
mv src/components/NodeProvisionForm.tsx src/components/VPN/

mv src/components/NetworkDevicesModule.tsx src/components/Devices/
mv src/components/ScannerModule.tsx src/components/Devices/
mv src/components/NodeAccessPanel.tsx src/components/Devices/

mv src/components/ApMonitorModule.tsx src/components/Monitor/

mv src/components/SettingsModule.tsx src/components/Settings/
mv src/components/UserManagementModule.tsx src/components/Settings/

mv src/components/RouterAccess.tsx src/components/Auth/

mv src/components/routeros.service.js src/utils/services/
mv src/components/ubiquiti.service.js src/utils/services/

# Verificar
ls src/components/
# Debe mostrar solo carpetas: Auth, Common, Devices, Monitor, Settings, VPN
```

### Opción 2: Con Visual Studio Code

1. **Abrir Explorer**
2. **Crear carpetas (click derecho → New Folder):**
   - src/components/Common
   - src/components/VPN
   - src/components/Devices
   - src/components/Monitor
   - src/components/Settings
   - src/components/Auth
   - src/utils/services

3. **Drag & drop archivos:**
   - Arrastrar archivos a sus nuevas carpetas

4. **Listo:** Los imports se actualizarán automáticamente

---

## ⚠️ Notas Importantes

### No Cambiar Código
✅ **Está permitido:**
- Mover archivos
- Crear carpetas
- Cambiar imports
- Agregar documentación

❌ **NO está permitido:**
- Modificar código dentro de archivos
- Refactorizar componentes
- Cambiar lógica
- Renombrar variables
- Eliminar líneas

### Imports Automáticos (VS Code)
Si VS Code no actualiza automáticamente los imports:
1. Click derecho en archivo movido
2. `Update Imports` (si está disponible)
3. O actualizar manualmente en `src/App.tsx`

### Verificación Constante
Después de cada fase:
```bash
npm run dev
# Verificar: No hay errores, app funciona igual
```

---

## 📊 Resumen de Cambios

| Métrica | Antes | Después | Cambio |
|---------|-------|---------|--------|
| Archivos en `src/components/` | 17 | 0 | -17 (todos en subcarpetas) |
| Subcarpetas en `components/` | 0 | 6 | +6 |
| Servicios en `components/` | 2 | 0 | -2 (a utils/services) |
| README.md en proyecto | 0 | 12 | +12 |
| Líneas de código | Igual | Igual | ±0 |
| Funcionalidad | 100% | 100% | Sin cambios |

---

## 🎯 Beneficios Después

✅ **Mejor Organización**
- Componentes agrupados por dominio
- Servicios separados de componentes
- Estructura clara y escalable

✅ **Más Fácil de Navegar**
- Encontrar archivos relacionados rápido
- README.md explicar cada carpeta
- Nuevos desarrolladores comprenden mejor

✅ **Facilita Refactorización Futura**
- Si NodeCard (800 líneas) necesita split, hay lugar para sub-componentes
- Estructura lista para crecimiento

✅ **Mejor Mantenibilidad**
- Componentes grandes tienen su propia carpeta
- Componentes pequeños agrupados juntos
- Servicios donde deberían estar

---

**Documento creado:** 2026-05-29  
**Estado:** Listo para ejecutar  
**Tiempo estimado:** 30-45 minutos  
**Riesgo:** BAJO - Solo cambios estructurales, sin cambios de código
