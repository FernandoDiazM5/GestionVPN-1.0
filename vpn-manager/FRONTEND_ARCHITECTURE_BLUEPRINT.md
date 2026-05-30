# 🎨 VPN Manager Frontend - Architecture Blueprint

**Proyecto:** ProyectoVPN 3.0  
**Módulo:** vpn-manager (Frontend React 19)  
**Última actualización:** 2026-05-29  
**Estado:** Completo y Funcional

---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Estructura de Directorios](#estructura-de-directorios)
3. [Análisis por Directorio](#análisis-por-directorio)
4. [Componentes Principales](#componentes-principales)
5. [Sistema de Tipos](#sistema-de-tipos)
6. [Gestión de Estado](#gestión-de-estado)
7. [Utilidades y Servicios](#utilidades-y-servicios)
8. [Configuración y Build](#configuración-y-build)
9. [Flujos de Datos](#flujos-de-datos)
10. [Patrones y Convenciones](#patrones-y-convenciones)
11. [Guía de Desarrollo](#guía-de-desarrollo)

---

## 📱 Visión General

### Tecnologías Core

| Aspecto | Tecnología | Versión |
|---------|-----------|---------|
| **Framework** | React | 19.2.4 |
| **Lenguaje** | TypeScript | 5.9.3 |
| **Bundler** | Vite | 8.0.0 |
| **CSS Framework** | Tailwind CSS | 3.4.1 |
| **Iconos** | Lucide React | 0.577.0 |
| **State Management** | Zustand + Context API | 4.5.7 |
| **Persistencia Local** | LocalForage | 1.10.0 |
| **UUID Generation** | uuid | 10.0.0 |

### Propósito de la Aplicación

Interfaz web para **gestión centralizada de tuneles VPN, dispositivos de red y monitoreo de Access Points** en infraestructura MikroTik/Ubiquiti.

**Funcionalidades principales:**
- 🔐 Autenticación y gestión de credenciales MikroTik
- 📡 Gestión de nodos VPN y tuneles
- 🔍 Escaneo y descubrimiento de dispositivos
- 📊 Monitoreo en tiempo real de Access Points
- 🛠️ Configuración de routers y tuneles
- 👥 Gestión de usuarios y permisos
- 🗺️ Visualización de topología de red (Módulo separado)

---

## 🗂️ Estructura de Directorios

```
vpn-manager/
├── src/
│   ├── components/              # Componentes React (módulos principales)
│   │   ├── ApMonitorModule.tsx          (650+ líneas)
│   │   ├── NetworkDevicesModule.tsx     (750+ líneas)
│   │   ├── NodeCard.tsx                 (800 líneas) ⚠️ MÁS GRANDE
│   │   ├── NodeProvisionForm.tsx        (393 líneas)
│   │   ├── VpnCard.tsx                  (290 líneas)
│   │   ├── ScannerModule.tsx            (244 líneas)
│   │   ├── UserManagementModule.tsx     (244 líneas)
│   │   ├── RouterAccess.tsx             (196 líneas)
│   │   ├── SettingsModule.tsx           (153 líneas)
│   │   ├── NodeAccessPanel.tsx          (componente)
│   │   ├── ConfirmModal.tsx             (modal genérico)
│   │   ├── M5FullInfoModal.tsx          (modal especializado)
│   │   └── DeviceCard.tsx               (componente tarjeta)
│   │
│   ├── context/                 # Context API - Estado Global
│   │   └── VpnContext.tsx               (412 líneas)
│   │       ├── VpnContextType (interface)
│   │       ├── VpnProvider (wrapper)
│   │       └── useVpn() (hook)
│   │
│   ├── store/                   # Zustand + LocalForage - Persistencia
│   │   ├── db.ts                        (119 líneas)
│   │   ├── deviceDb.ts                  (196 líneas)
│   │   └── cpeCache.ts                  (53 líneas)
│   │
│   ├── types/                   # Contratos TypeScript (API)
│   │   ├── api.ts                       (108 líneas)
│   │   ├── devices.ts                   (249 líneas)
│   │   └── apMonitor.ts                 (157 líneas)
│   │
│   ├── utils/                   # Funciones Reutilizables
│   │   ├── apiClient.ts                 (53 líneas) - HTTP + JWT
│   │   ├── crypto.ts                    (81 líneas) - Cifrado local
│   │   └── fetchWithTimeout.ts          (24 líneas) - Fetch robusto
│   │
│   ├── assets/                  # Recursos Estáticos
│   │   ├── react.svg
│   │   ├── vite.svg
│   │   └── hero.png
│   │
│   ├── App.tsx                  # Componente Raíz
│   ├── App.css                  # Estilos Globales App
│   ├── main.tsx                 # Punto de Entrada
│   ├── index.css                # Reset + Estilos Globales
│   └── config.ts                # Configuración (API_BASE_URL, etc)
│
├── public/                      # Assets públicos (HTML, favicon)
│
├── Archivos de Configuración
│   ├── package.json             # Dependencias y scripts npm
│   ├── vite.config.ts           # Config bundler (puerto 5173, proxy)
│   ├── tsconfig.json            # Config TypeScript (raíz)
│   ├── tsconfig.app.json        # Config TypeScript (app)
│   ├── tsconfig.node.json       # Config TypeScript (build tools)
│   ├── tailwind.config.js       # Theme + extensiones CSS
│   ├── postcss.config.js        # Post-procesamiento CSS
│   ├── eslint.config.js         # Linting reglas
│   └── index.html               # HTML principal
│
└── node_modules/                # Dependencias instaladas

TOTAL: 12,561 líneas de TypeScript + JSX
```

---

## 🔍 Análisis por Directorio

### 1️⃣ `src/components/` - Módulos React

**Propósito:** Componentes auto-contenidos que representan módulos o vistas principales.

**Patrón Observado:** Cada componente es grande (200-800 líneas) y contiene:
- Toda la lógica de renderizado
- Estado local (useState)
- API calls (fetch)
- Modales y sub-componentes

#### Componentes Detallados

##### 🔴 **NodeCard.tsx** (800 líneas) - CRÍTICO
```
Propósito: Renderizar tarjeta de nodo VPN individual

Responsabilidades:
- Mostrar información del nodo (nombre, IP, estado)
- Permitir expandir/contraer detalles
- Botones de acción (activar, editar, eliminar)
- Integración con modales de configuración
- Estado de carga y sincronización

Estado Local (useState):
- expanded: boolean
- loading: boolean
- nodeData: NodeData | null
- selectedAction: string | null

API Calls:
- GET /api/node/{id}
- POST /api/node/{id}/activate
- DELETE /api/node/{id}

Sub-componentes:
- Modal de configuración avanzada
- Badge de estado
- Indicadores de actividad

Flujos Principales:
1. Cargar datos del nodo
2. Expandir/contraer detalles
3. Ejecutar acciones (activar, editar, eliminar)
4. Mostrar estado en tiempo real

Áreas Críticas:
- API error handling
- State synchronization con VpnContext
- Re-renders innecesarios
```

**⚠️ Nota:** Este es el componente más grande. Si crece >1000 líneas, considerar split en:
- NodeCardHeader (encabezado)
- NodeCardBody (detalles)
- NodeCardActions (botones)
- useNodeCard hook (lógica)

##### 🟠 **NetworkDevicesModule.tsx** (~750 líneas)
```
Propósito: Módulo de escaneo y listado de dispositivos

Responsabilidades:
- Interfaz de control de scan (botón, parámetros)
- Progreso de scan (barra de porcentaje)
- Tabla/listado de dispositivos encontrados
- Filtrado y búsqueda (IP, tipo, estado)
- Acciones masivas (agregar, eliminar)

Estado Local:
- isScanning: boolean
- scanProgress: number (0-100)
- devices: Device[]
- filters: FilterOptions
- selectedDevices: string[]

API Calls:
- POST /api/device/scan
- GET /api/device/list
- POST /api/device/import
- DELETE /api/device/{id}

Sub-componentes:
- DeviceCard[] (una por dispositivo)
- ScanProgressBar
- FilterBar
- ActionBar

Flujos:
1. Iniciar scan de dispositivos
2. Monitorear progreso
3. Mostrar resultados en tabla
4. Filtrar/buscar dispositivos
5. Ejecutar acciones
```

##### 🟠 **ApMonitorModule.tsx** (~650 líneas)
```
Propósito: Dashboard de monitoreo de Access Points

Responsabilidades:
- Listar APs conectados
- Mostrar métricas (señal, tráfico, CCQ)
- Gráficos de tendencias
- Listado de estaciones conectadas por AP
- Polling automático (cada 5-30s)

Estado Local:
- aps: AccessPoint[]
- stations: Station[]
- metrics: ApMetrics[]
- refreshInterval: number
- isPolling: boolean

API Calls:
- GET /api/ap-monitor/status
- GET /api/ap-monitor/{ap-id}/stations
- GET /api/ap-monitor/{ap-id}/metrics

Sub-componentes:
- ApCard (tarjeta por AP)
- MetricChart (gráfico genérico)
- SignalIndicator
- TrafficMeter
- StationsTable

Flujos Críticos:
1. Cargar estado inicial de APs
2. Iniciar polling automático
3. Actualizar métricas sin refrescar página
4. Mostrar gráficos en tiempo real
5. Listar estaciones por AP
```

##### 🟡 **NodeProvisionForm.tsx** (393 líneas)
```
Propósito: Formulario de creación/edición de nodos

Responsabilidades:
- Campos de entrada (nombre, IP, puerto, usuario, contraseña)
- Validación de formulario
- Submit a backend
- Manejo de errores
- Confirmación de contraseña

Estado Local:
- formData: NodeFormData
- errors: FormErrors
- isSubmitting: boolean
- submitError: string | null

API Calls:
- POST /api/node (crear)
- PUT /api/node/{id} (editar)

Validaciones:
- IP válida
- Puerto en rango 1-65535
- Usuario no vacío
- Contraseña mínimo 8 caracteres
```

##### 🟡 Otros Componentes (200-290 líneas)
- **VpnCard.tsx** (290) - Renderizar tarjeta de tunel VPN
- **ScannerModule.tsx** (244) - Control de escaneo general
- **UserManagementModule.tsx** (244) - CRUD de usuarios
- **RouterAccess.tsx** (196) - Formulario de login inicial
- **SettingsModule.tsx** (153) - Configuración del sistema
- **NodeAccessPanel.tsx** - Panel lateral de navegación
- **ConfirmModal.tsx** - Modal de confirmación reutilizable
- **M5FullInfoModal.tsx** - Modal de información ampliada
- **DeviceCard.tsx** - Tarjeta individual de dispositivo

---

### 2️⃣ `src/context/` - Estado Global

**VpnContext.tsx** (412 líneas) - Punto central de estado compartido

```typescript
interface VpnContextType {
  // ============ AUTENTICACIÓN ============
  isAuthenticated: boolean;
  credentials: RouterCredentials | undefined;
  isReady: boolean;
  handleLoginSuccess: (creds: RouterCredentials) => void;
  handleLogout: () => Promise<void>;

  // ============ VPN MANAGEMENT ============
  managedVpns: VpnSecret[];                      // VPNs provisioned
  setManagedVpns: React.Dispatch<...>;

  // ============ SCANNER STATE ============
  scannedSecrets: VpnSecret[];                   // De scan reciente
  setScannedSecrets: React.Dispatch<...>;
  hasScanned: boolean;
  setHasScanned: React.Dispatch<...>;

  // ============ NODES & TUNNELS ============
  nodes: NodeInfo[];
  setNodes: React.Dispatch<...>;
  activeNodeVrf: string | null;
  setActiveNodeVrf: React.Dispatch<...>;
  tunnelExpiry: number | null;
  setTunnelExpiry: React.Dispatch<...>;
  adminIP: string;
  setAdminIP: React.Dispatch<...>;
  deactivateAllNodes: () => Promise<void>;
  removeNodeFromState: (pppUser: string) => void;

  // ============ NAVEGACIÓN ============
  activeModule: 'nodes' | 'devices' | 'monitor' | 'settings';
  setActiveModule: React.Dispatch<...>;

  // ============ TEMA ============
  darkMode: boolean;
  toggleDarkMode: () => void;
}
```

**Constantes Clave:**
```typescript
TUNNEL_TIMEOUT_MS   = 30 * 60 * 1000; // 30 minutos (expiración de túnel)
TUNNEL_KEEPALIVE_MS =  5 * 60 * 1000; // 5 minutos (heartbeat)
```

**Uso Típico:**
```typescript
const { 
  isAuthenticated, 
  nodes, 
  activeModule, 
  setActiveModule 
} = useVpn();
```

---

### 3️⃣ `src/store/` - Persistencia Local

Usa **Zustand + LocalForage + IndexedDB** para guardar datos que persisten entre sesiones.

#### **db.ts** (119 líneas) - Base de Credenciales
```typescript
// Almacena credenciales de login cifradas localmente
interface VpnSecret {
  id: string;
  tunnelName: string;
  username: string;
  secretKey: string;  // Cifrado con crypto.ts
  createdAt: number;
}

interface RouterCredentials {
  host: string;
  port: number;
  username: string;
  password: string;  // Cifrado
  role: 'admin' | 'user';
}

Funciones Exportadas:
- loadCredentials(): Promise<RouterCredentials | null>
- saveCredentials(creds): Promise<void>
- clearCredentials(): Promise<void>
- loadVpnSecrets(): Promise<VpnSecret[]>
- saveVpnSecret(secret): Promise<void>
```

#### **deviceDb.ts** (196 líneas) - Caché de Dispositivos
```typescript
// Cachea dispositivos escaneados para búsqueda rápida
interface CachedDevice {
  id: string;
  name: string;
  ip: string;
  type: 'AP' | 'CPE' | 'Router';
  status: 'online' | 'offline';
  lastSeen: number;
}

Funciones:
- cacheDevices(devices): Promise<void>
- getCachedDevices(): Promise<CachedDevice[]>
- searchDevices(query): Promise<CachedDevice[]>
- clearDeviceCache(): Promise<void>
```

#### **cpeCache.ts** (53 líneas) - Caché CPE
```typescript
// Cachea equipos CPE para acceso rápido
interface CPEData {
  id: string;
  macAddress: string;
  signalStrength: number;
  uptime: number;
}

Funciones:
- updateCPEData(id, data): Promise<void>
- getCPEData(id): Promise<CPEData | null>
```

**Arquitectura:**
```
VpnContext
  ↓
useVpn hook (acceso)
  ↓
Actions → actualiza state → persiste en db.ts/deviceDb.ts
  ↓
LocalForage (IndexedDB)
```

---

### 4️⃣ `src/types/` - Contratos de API (TypeScript)

Define la forma exacta de datos que vienen del backend. **Criticidad: ALTA** - Deben mantenerse sincronizadas con backend.

#### **api.ts** (108 líneas)
```typescript
// Tipos generales y comunes

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AuthResponse {
  token: string;
  user: { id: string; role: 'admin' | 'user' };
}

interface NodeInfo {
  id: string;
  pppUser: string;
  pppPassword: string;
  vpnType: 'SSTP' | 'WireGuard' | 'PTP';
  localAddress: string;
  remoteAddress: string;
  status: 'active' | 'inactive' | 'error';
  createdAt: number;
}

interface VpnSecret {
  id: string;
  tunnelName: string;
  username: string;
  secretKey: string;
}
```

#### **devices.ts** (249 líneas)
```typescript
// Tipos de dispositivos de red

interface Device {
  id: string;
  name: string;
  ip: string;
  macAddress: string;
  type: 'AP' | 'CPE' | 'Router' | 'Bridge';
  online: boolean;
  signal?: number; // dBm
  ccq?: number;    // 0-100 %
  uptime?: number; // segundos
  lastSeen: number;
}

interface AccessPoint {
  id: string;
  name: string;
  ipAddress: string;
  frequency: number;           // 2.4 o 5 GHz
  power: number;               // dBm
  bandwidth: number;           // MHz
  stations: number;            // cantidad conectada
  signal: {
    min: number;
    avg: number;
    max: number;
  };
  traffic: {
    transmitted: number;       // bytes
    received: number;          // bytes
  };
}

interface CPE {
  id: string;
  name: string;
  ipAddress: string;
  signalStrength: number;      // dBm
  ccq: number;                 // 0-100
  txRate: number;              // Mbps
  rxRate: number;              // Mbps
  errorRate: number;           // %
  distance?: number;           // metros
}
```

#### **apMonitor.ts** (157 líneas)
```typescript
// Tipos específicos de monitoreo AP

interface ApMetrics {
  apId: string;
  timestamp: number;
  signalStrength: number;      // dBm actual
  ccq: number;                 // Current Channel Quality %
  txRate: number;              // Mbps
  rxRate: number;              // Mbps
  activeStations: number;
  bandwidth: number;           // Utilización %
}

interface Station {
  apId: string;
  macAddress: string;
  ipAddress: string;
  signalStrength: number;
  ccq: number;
  txRate: number;
  rxRate: number;
  lastSeen: number;
}

interface ApMonitorResponse {
  ap: AccessPoint;
  metrics: ApMetrics;
  stations: Station[];
}
```

---

### 5️⃣ `src/utils/` - Funciones Reutilizables

#### **apiClient.ts** (53 líneas) - HTTP Client
```typescript
// Wrapper de fetch con JWT integrado

let apiToken: string | null = null;

export function setApiToken(token: string) {
  apiToken = token;
  // Guarda en sessionStorage para requests posteriores
}

export function getApiToken(): string | null {
  return apiToken;
}

// Uso:
const res = await fetch(url, {
  headers: {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
  }
});
```

#### **crypto.ts** (81 líneas) - Cifrado Local
```typescript
// Cifra/descifra credenciales almacenadas en IndexedDB

export function encryptPassword(password: string, key: string): string {
  // Utiliza WebCrypto API o algoritmo similar
}

export function decryptPassword(encrypted: string, key: string): string {
  // Descifra datos sensibles
}

// Uso:
const encrypted = encryptPassword('mi_contraseña', 'salt_key');
const decrypted = decryptPassword(encrypted, 'salt_key');
```

#### **fetchWithTimeout.ts** (24 líneas) - Fetch Robusto
```typescript
// Fetch con timeout automático para evitar cuelgues

export function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs: number = 10000
): Promise<Response> {
  // Implementa timeout para requests largos
}

// Uso:
const res = await fetchWithTimeout(url, {}, 15000); // 15s timeout
```

---

### 6️⃣ `src/config.ts` - Configuración

```typescript
export const API_BASE_URL = 
  process.env.VITE_API_URL || 'http://localhost:3001';

// Constantes de timeouts
export const FETCH_TIMEOUT_MS = 15000;
export const API_RETRY_ATTEMPTS = 3;
export const POLL_INTERVAL_MS = 5000;

// Feature flags (si existen)
export const FEATURES = {
  TOPOLOGY_VIEW: true,
  AP_MONITOR: true,
  WIREGUARD_SUPPORT: true,
};
```

---

### 7️⃣ `src/App.tsx` - Componente Raíz

```typescript
// Estructura general:
export default function App() {
  return (
    <VpnProvider>  {/* Context global */}
      <AppContent />
    </VpnProvider>
  );
}

function AppContent() {
  const { isAuthenticated, isReady, activeModule } = useVpn();

  // 1. Si no está ready → mostrar loading
  // 2. Si no autenticado → mostrar RouterAccess (login)
  // 3. Si autenticado → mostrar navbar + módulo activo

  return (
    <div className="page-bg text-slate-900">
      <nav className="sticky top-0 glass-nav">
        {/* Navbar con tabs */}
      </nav>
      {/* Módulo activo basado en activeModule */}
      {activeModule === 'nodes' && <NodeAccessPanel />}
      {activeModule === 'devices' && <NetworkDevicesModule />}
      {activeModule === 'monitor' && <ApMonitorModule />}
      {activeModule === 'settings' && <SettingsModule />}
    </div>
  );
}
```

---

## 💾 Sistema de Tipos

### Sincronización Frontend ↔ Backend

**Crítico:** Los tipos TypeScript deben **SIEMPRE** coincidir con las respuestas del backend.

**Proceso de Actualización:**

```
1. Backend agrega un nuevo campo:
   server/routes/device.routes.js → GET /api/device/{id}
   
2. Frontend debe actualizar:
   src/types/devices.ts → interface Device
   
3. Componentes que usan el tipo:
   - TypeScript error si falta el campo
   - El error obliga a actualizar código
```

**Ejemplo de Mismatch:**

❌ **MALO:**
```typescript
// Backend retorna:
{ id, name, ip, signal, ccq }

// Frontend espera:
{ id, name, ip }  // Falta signal y ccq
```

✅ **BIEN:**
```typescript
// Backend retorna:
{ id, name, ip, signal, ccq }

// Frontend espera:
interface Device {
  id: string;
  name: string;
  ip: string;
  signal?: number;  // opcional
  ccq?: number;     // opcional
}
```

---

## 🎯 Gestión de Estado

### Niveles de Estado

```
Nivel 1: Global (VpnContext)
  - Autenticación
  - Nodos activos
  - Módulo activo
  - Tema (dark/light)
  
Nivel 2: Módulo-Local (useState)
  - Datos de scan
  - Filtros
  - Expansiones
  
Nivel 3: Persistente (IndexedDB)
  - Credenciales (cifradas)
  - Dispositivos cacheados
  - Preferencias del usuario
```

### Flow de Datos

```
Componente
  ↓ (evento usuario)
Actualiza estado local (useState)
  ↓ (si es crítico)
Notifica VpnContext
  ↓ (si debe persistir)
Guarda en IndexedDB (store/db.ts)
  ↓ (si es remoto)
API call a backend
  ↓
Respuesta backend
  ↓
Actualiza VpnContext
  ↓
Componentes suscritos se re-renderizan
```

---

## 🛠️ Utilidades y Servicios

### apiClient.ts - Gestión de Tokens

```typescript
// Centraliza la lógica de autenticación

let _apiToken: string | null = null;

export const setApiToken = (token: string) => {
  _apiToken = token;
  sessionStorage.setItem('auth_token', token);
};

export const getApiToken = (): string | null => {
  return _apiToken || sessionStorage.getItem('auth_token');
};

// Para cada request:
const headers = new Headers({
  'Authorization': `Bearer ${getApiToken()}`,
  'Content-Type': 'application/json'
});
```

### crypto.ts - Seguridad Local

```typescript
// Cifra datos sensibles antes de guardar en IndexedDB

import { getRandomValues } from 'crypto';

export function encryptPassword(password: string, masterKey: string): string {
  // Implementar cifrado AES-256 o similar
}

export function decryptPassword(encrypted: string, masterKey: string): string {
  // Descifrar de forma segura
}

// Nunca guardes contraseñas en plain text
```

---

## ⚙️ Configuración y Build

### **vite.config.ts** - Bundler

```typescript
export default defineConfig({
  plugins: [react()],
  base: '/GestionVPN-1.0/',                    // Ruta base en producción
  resolve: {
    dedupe: ['react', 'react-dom'],            // Evita dupes
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',       // Proxy a backend
        changeOrigin: true,
      }
    }
  }
})
```

### **tailwind.config.js** - Theme

```javascript
export default {
  darkMode: 'class',                           // Soporte dark mode
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        indigo: { /* palette 50-950 */ },      // Color primario
        slate: { /* palette 50-950 */ }        // Color secundario
      },
      fontFamily: {
        sans: ['Inter', 'system-ui'],
        mono: ['JetBrains Mono', 'Fira Code']
      }
    },
  }
}
```

### **tsconfig.json** - TypeScript

```json
{
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**tsconfig.app.json** (para código de aplicación):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "strict": true,                            // ⚠️ Importante: tipado fuerte
    "moduleResolution": "bundler",
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

---

## 📊 Flujos de Datos Principales

### 1️⃣ Flujo de Autenticación

```
RouterAccess.tsx (formulario login)
  ↓ [usuario ingresa host, usuario, contraseña]
  ↓
VpnContext.handleLoginSuccess()
  ↓
db.ts → saveCredentials() [cifrada en IndexedDB]
  ↓
apiClient.ts → setApiToken(token)
  ↓
App.tsx renderiza módulos en lugar de login
  ↓
VpnProvider establece isAuthenticated = true
```

**Puntos de Error:**
- ❌ Host inaccesible
- ❌ Credenciales inválidas
- ❌ IndexedDB no disponible

### 2️⃣ Flujo de Escaneo de Dispositivos

```
ScannerModule → click botón "Escanear"
  ↓
POST /api/device/scan
  ↓
Backend (ubiquiti.service.js) → SSH a router
  ↓
Parsea respuesta MikroTik
  ↓
Retorna JSON {devices: [...]}
  ↓
Frontend → deviceDb.ts.cacheDevices(devices)
  ↓
IndexedDB actualiza caché
  ↓
NetworkDevicesModule.tsx renderiza tabla
```

**Secuencia de Peticiones:**
```
1. POST /api/device/scan?type=AP&timeout=30
   Response: { jobId: "scan-123", status: "running" }

2. GET /api/device/scan?jobId=scan-123
   Response: { status: "50%", devices: [...] }

3. GET /api/device/scan?jobId=scan-123 (loop hasta 100%)
   Response: { status: "100%", devices: [...], complete: true }
```

### 3️⃣ Flujo de Monitoreo AP (Polling)

```
ApMonitorModule.tsx (componentDidMount)
  ↓ [inicia polling cada 5-30 segundos]
  ↓
GET /api/ap-monitor/status
  ↓
Backend parsea mca-status de APs
  ↓
Retorna {aps: [...], metrics: [...], stations: [...]}
  ↓
ApMonitorModule.tsx actualiza estado local
  ↓
Gráficos + tablas se actualizan sin refrescar
  ↓
[Interval sigue ejecutándose cada X segundos]
```

**Error Handling:**
```javascript
try {
  const res = await fetch('/api/ap-monitor/status');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  setApData(data);
} catch (err) {
  setError('No se pudo obtener datos de APs');
  // Reintentar en próximo intervalo
}
```

---

## 📐 Patrones y Convenciones

### Naming Conventions

#### Archivos y Carpetas

| Tipo | Patrón | Ejemplo |
|------|--------|---------|
| Componente React | **PascalCase.tsx** | `NodeCard.tsx`, `ApMonitorModule.tsx` |
| Hook personalizado | **use[Name].ts** | `useNodeCard.ts` (no existe aún) |
| Servicios | **[domain].ts** | `apiClient.ts`, `crypto.ts` |
| Tipos | **[domain].ts** con `type/interface` | `devices.ts` → `type Device` |
| Utilidades | **[purpose].ts** | `fetchWithTimeout.ts` |
| Carpetas | **kebab-case o singular** | `components/`, `types/`, `utils/` |

#### Componentes

```typescript
// ✅ BIEN
export default function NodeCard() { ... }

// ❌ MALO
export default function nodeCard() { ... }
```

#### Interfaces

```typescript
// ✅ BIEN
interface NodeCardProps { ... }
export type Device = { ... }

// ❌ MALO
interface INodeCard { ... }  // Prefijo I es legacy
```

#### Estados

```typescript
// ✅ BIEN
const [isLoading, setIsLoading] = useState(false);
const [nodeData, setNodeData] = useState<NodeData | null>(null);

// ❌ MALO
const [loading, setLoading] = useState(false);     // falta "is" para booleans
const [data, setData] = useState(null);            // muy genérico
```

---

### Componentes Modulares

Cada componente es auto-contenido:

```typescript
// ✅ Patrón observado
export default function NodeCard() {
  // Estado local
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Context global
  const { nodes, setNodes } = useVpn();

  // API calls
  useEffect(() => {
    fetchNodeData();
  }, []);

  // Renderizado
  return (
    <div className="...">
      {/* JSX */}
    </div>
  );
}
```

---

## 🚀 Guía de Desarrollo

### Iniciar Desarrollo

```bash
# Instalar dependencias
npm install

# Iniciar servidor desarrollo (puerto 5173)
npm run dev

# En otra terminal, asegúrate que backend está en puerto 3001
# El proxy en vite.config.ts reenviará /api a http://localhost:3001
```

### Agregar Nuevo Componente

**Paso 1:** Crear archivo en `src/components/`

```typescript
// src/components/NuevoModulo.tsx
import { useState, useEffect } from 'react';
import { useVpn } from '../context/VpnContext';
import type { SomeType } from '../types/api';

export default function NuevoModulo() {
  const [state, setState] = useState<SomeType>();
  const { activeModule } = useVpn();

  useEffect(() => {
    // Cargar datos
  }, []);

  return (
    <div className="p-4">
      {/* JSX */}
    </div>
  );
}
```

**Paso 2:** Registrar en `App.tsx`

```typescript
// En AppContent()
{activeModule === 'nuevo' && <NuevoModulo />}
```

**Paso 3:** Actualizar tipos en `src/types/`

```typescript
// Si necesitas tipos nuevos
export interface SomeType {
  // propiedades
}
```

### Agregar Hook Personalizado

```typescript
// src/utils/useNewHook.ts
import { useState, useCallback, useEffect } from 'react';

export function useNewHook(param: string) {
  const [state, setState] = useState<any>();
  const [loading, setLoading] = useState(false);

  const fetch Data = useCallback(async () => {
    setLoading(true);
    try {
      // Lógica
    } finally {
      setLoading(false);
    }
  }, [param]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { state, loading, refetch: fetchData };
}

// Uso en componente
const { state, loading } = useNewHook('param');
```

### Hacer API Call

```typescript
// ✅ Recomendado: usar apiClient
import { API_BASE_URL } from '../config';
import { getApiToken } from '../utils/apiClient';

async function getNodeData(nodeId: string) {
  const token = getApiToken();
  const res = await fetch(
    `${API_BASE_URL}/api/node/${nodeId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
```

### Tipado Fuerte

```typescript
// ✅ BIEN: siempre especificar tipos
const [devices, setDevices] = useState<Device[]>([]);
const [loading, setLoading] = useState<boolean>(false);

function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
  // ...
}

// ❌ MALO: tipos implícitos
const [devices, setDevices] = useState([]);
const [loading, setLoading] = useState(false);
```

---

## 📋 Checklist de Desarrollo

### Antes de hacer commit

- [ ] Código compila sin errores
- [ ] No hay warnings de TypeScript
- [ ] No hay console.log() sin remover
- [ ] Nombres de variables son descriptivos
- [ ] Tipos están correctamente especificados
- [ ] Componentes nuevos están registrados en App.tsx
- [ ] API calls manejan errores
- [ ] Estados están inicializados correctamente

### Antes de push a producción

- [ ] npm run build funciona sin errores
- [ ] Dist/ se genera correctamente
- [ ] Tipos de API coinciden con backend
- [ ] No hay imports no usados
- [ ] ESLint no muestra warnings

---

## 📞 Problemas Comunes

### "CORS Error en desarrollo"

**Causa:** Backend en puerto 3001 no está corriendo  
**Solución:** Asegúrate que `npm run dev` en server/ está ejecutándose

### "Token expirado"

**Causa:** JWT tiene límite de tiempo  
**Solución:** Implementar refresh token o re-login

### "IndexedDB quota exceeded"

**Causa:** Caché de dispositivos está muy grande  
**Solución:** Implementar límite de caché o limpiar periódicamente

---

## 📊 Estadísticas del Proyecto

| Métrica | Valor |
|---------|-------|
| Total líneas TypeScript/JSX | 12,561 |
| Componentes | 13 |
| Hooks custom | 0 (oportunidad de mejora) |
| Interfaces/Types | 30+ |
| Directorios | 6 |
| Archivos de configuración | 6 |
| Dependencias principales | 7 |

---

## ✅ Estado del Proyecto

**Frontend:** ✅ Funcional y Completo  
**Organización:** ✅ Bien estructurado  
**Tipado:** ✅ TypeScript estricto  
**Mantenibilidad:** ⚠️ Componentes grandes (NodeCard.tsx 800 líneas)

**Recomendación:** Monitorear tamaño de componentes. Si alguno supera 1000 líneas, considerar refactorización.

---

**Documento generado:** 2026-05-29  
**Responsable:** Análisis de arquitectura frontend  
**Próxima actualización:** Cuando cambios estructurales significativos
