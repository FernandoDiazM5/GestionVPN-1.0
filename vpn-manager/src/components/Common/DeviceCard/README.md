# DeviceCard Component Structure

## Overview
The DeviceCard component displays detailed telemetry information for wireless devices (APs and CPEs). It has been refactored into a modular structure for better maintainability while preserving all original functionality.

## Directory Structure

```
DeviceCard/
├── DeviceCard.tsx          # Main component (orchestrator)
├── index.ts                # Public export
├── README.md               # This file
├── components/             # Presentation components
│   ├── AcParams.tsx        # AC-specific parameters section
│   ├── AdvancedParams.tsx  # Advanced M-series parameters
│   ├── AntennaSectionMain.tsx # Main antenna metrics (signal, CCQ, TX/RX, etc)
│   ├── Bar.tsx             # Progress bar component
│   ├── DeviceHeader.tsx    # Top header with device name/role
│   ├── DeviceParams.tsx    # Device information section
│   ├── EmptyState.tsx      # Empty state UI
│   ├── ErrorSection.tsx    # Error display section
│   ├── GaugeChart.tsx      # Circular gauge SVG for CPU/Memory
│   ├── InfoStrip.tsx       # Quick info strip (IP, MAC, frequency)
│   ├── InterfacesSection.tsx # Physical network interfaces
│   ├── LoadButton.tsx      # Load telemetry button
│   ├── LoadingSection.tsx  # Loading overlay
│   ├── ParamRow.tsx        # Parameter label-value pair
│   ├── RawOutput.tsx       # Raw SSH output display
│   ├── StationsList.tsx    # Connected stations/clients
│   └── WirelessParams.tsx  # Wireless configuration parameters
├── hooks/                  # Custom React hooks
│   └── useAntennaData.ts   # State management for antenna data loading
└── utils/                  # Utility functions
    ├── colors.ts           # Color functions (signalMeta, ccqColor)
    └── formatters.ts       # Format functions (fmtSecurity, fmtMode, etc)
```

## Component Responsibilities

### Main Component
- **DeviceCard.tsx**: Orchestrates sub-components, manages prop drilling, renders sections based on data state

### Presentation Components
- **DeviceHeader**: Top section with device name, role badge, and delete button
- **InfoStrip**: Quick info display (IP, MAC, frequency, mode)
- **LoadButton**: Button to fetch antenna data, displays last update time
- **LoadingSection**: Overlay shown during SSH connection
- **ErrorSection**: Error message display
- **EmptyState**: Message when no data has been fetched
- **AntennaSectionMain**: Signal, CCQ, TX/RX rates, CPU/Memory gauges, airMAX info
- **DeviceParams**: Device name, model, firmware, uptime, MAC addresses
- **WirelessParams**: SSID, security, channel, frequency, antenna config
- **AcParams**: Temperature, CINR, NSS, MCS, antenna gain, airtime
- **AdvancedParams**: ATPC, Airsync, country code, RSSI chains
- **InterfacesSection**: Physical interfaces (eth0, wlan0, etc)
- **StationsList**: Connected wireless clients with signal/rate info
- **RawOutput**: Fallback raw SSH output display

### Helper Components
- **Bar**: Horizontal progress bar with gradient fill
- **GaugeChart**: Circular SVG gauge (CPU, Memory)
- **ParamRow**: Label-value pair row with hover effects

### Custom Hook
- **useAntennaData**: Handles SSH telemetry data fetching, caching, auto-fetch in compact mode

### Utilities
- **colors.ts**: 
  - `signalMeta(dbm)` - Returns signal quality label, color, gradient, percentage
  - `ccqColor(value)` - Returns appropriate color for CCQ percentage
  
- **formatters.ts**:
  - `fmtSecurity(s)` - Maps security types to readable names (WPA2-AES, etc)
  - `fmtMode(m)` - Maps wireless modes to Spanish names (Estación, Punto de Acceso)
  - `fmtNetRole(r)` - Maps network roles (Enrutador, Puente)
  - `cleanDeviceName(name)` - Extracts readable name from embedded key=value data

## Props

```typescript
interface DeviceCardProps {
  device: SavedDevice;           // Device data from database
  onRemove?: () => void;         // Callback when delete button clicked
  onUpdate?: (updated: SavedDevice) => void; // Update callback after fetch
  isPreview?: boolean;           // Read-only preview mode
  compact?: boolean;             // Show only signal, TX/RX, CPU/Memory
}
```

## Data Flow

1. **User clicks "Obtener Telemetría"** → `LoadButton` → `handleLoadAntenna()`
2. **SSH request sent** → Loading overlay shown → `LoadingSection`
3. **Success**: Data cached → `antennaStats` updated → Sections render
4. **Error**: Message shown → `ErrorSection` 
5. **Auto-fetch**: In `compact` mode with credentials → Automatic fetch on mount

## Styling

- **Dark mode**: `dark:` prefix for all colors
- **Tailwind CSS**: All styling via utility classes
- **Custom shadows**: Drop shadows on gauges, animations on bars
- **Color semantics**:
  - Green/Emerald: Good signal, high CCQ, normal load
  - Amber/Yellow: Warning, moderate values
  - Rose/Red: Critical, poor signal, high load
  - Slate/Gray: Neutral, unavailable data

## Usage

```tsx
import DeviceCard from '@/components/Common/DeviceCard';

<DeviceCard 
  device={deviceData}
  onRemove={() => deleteDevice()}
  onUpdate={(updated) => updateDevice(updated)}
/>

// Compact mode (only main metrics)
<DeviceCard device={deviceData} compact={true} />

// Preview (read-only)
<DeviceCard device={deviceData} isPreview={true} />
```

## Integration Points

- Imported in **ApMonitorModule** for modal detail views
- Imported in **DeviceCardModal** as modal wrapper
- Uses **fetchWithTimeout** for SSH operations
- Uses **SavedDevice** and **AntennaStats** types

## Notes

- All original code logic preserved, only reorganized
- No modifications to functionality or behavior
- TypeScript types maintained throughout
- Responsive design maintained (Tailwind breakpoints)
- Dark mode support complete
