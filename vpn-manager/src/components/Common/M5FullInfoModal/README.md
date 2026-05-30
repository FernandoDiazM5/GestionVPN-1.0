# M5FullInfoModal Component

## Overview

A comprehensive modal component for displaying detailed device information (antenna stats, system info, wireless details, interfaces, and services). Supports both M5 and AC device families with family-specific information display.

## Structure

```
M5FullInfoModal/
├── M5FullInfoModal.tsx              # Main orchestrator component
├── index.ts                         # Public export
├── types.ts                         # Type definitions
├── constants.ts                     # Labels and messages
├── hooks/
│   └── useCopiedIpState.ts          # Copy-to-clipboard state management
├── components/
│   ├── ModalHeader.tsx              # Header with device name and IP
│   ├── ModalContent.tsx             # Scrollable content container
│   ├── EmptyState.tsx               # "No data available" message
│   ├── M5Row.tsx                    # Data row component
│   ├── M5Section.tsx                # Section with title and icon
│   ├── IfaceBlock.tsx               # Interface details block
│   ├── SystemSection.tsx            # System/host information
│   ├── WirelessSection.tsx          # Wireless/RF information
│   ├── InterfacesSection.tsx        # Interfaces and traffic
│   └── ServicesSection.tsx          # Services and raw output
├── utils/
│   ├── deviceFamily.ts              # Device family detection
│   ├── styles.ts                    # Tailwind class definitions
│   └── formatters.ts                # Data formatting utilities
└── README.md                        # This file
```

## Usage

### Basic Example

```typescript
import M5FullInfoModal from '@/components/Common/M5FullInfoModal';
import { useState } from 'react';

export default function DeviceDetail({ device }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>View Details</button>
      <M5FullInfoModal dev={device} onClose={() => setIsOpen(false)} />
    </>
  );
}
```

## Props

```typescript
interface M5FullInfoModalProps {
  dev: ScannedDevice | SavedDevice;  // Device with optional cachedStats
  onClose: () => void;               // Callback when modal closes
}
```

## Features

- **Device Family Support**: Displays AC or M5-specific information
- **Comprehensive Data**: 4 main sections (System, Wireless, Interfaces, Services)
- **Raw Command Output**: SSH command outputs (mca-cli, iwconfig, wstalist, etc.)
- **Copy to Clipboard**: IP address with visual feedback
- **Responsive Design**: Works on all screen sizes
- **Modal Management**: Backdrop click or close button to dismiss
- **Dark Mode Ready**: Tailwind dark mode support

## Sections

### System (host)
- Hostname, model, firmware, uptime
- CPU load, memory statistics
- AC-specific: temperature, antenna height

### Wireless (wireless)
- Mode, ESSID, security, country code
- Signal strength (dBm), RSSI, noise floor, TX power
- Antenna gain, distance, CCQ
- Channel information and frequency
- AC-specific: modulational info, airtime, latency
- M5-specific: AirSync mode, ATPC status, retries

### Interfaces (physical & logical)
- Interface details (enabled, plugged, speed, duplex)
- DHCP status, cable length
- TX/RX bytes and errors
- Traffic statistics from /proc/net/dev
- Route information

### Services (management)
- AirMAX status and priority
- Raw command outputs:
  - mca-cli-op info
  - uname / uptime
  - iwconfig ath0
  - wstalist
  - /proc/meminfo

## Component Tree

```
M5FullInfoModal
├── ModalHeader
│   └── Activity icon, device name, IP, model
├── ModalContent (scrollable)
    ├── EmptyState (if no data)
    ├── SystemSection
    │   └── M5Row x 15
    ├── WirelessSection
    │   └── M5Row x 40+
    ├── InterfacesSection
    │   ├── IfaceBlock x N
    │   │   └── M5Row x 13
    │   └── Raw data blocks
    └── ServicesSection
        ├── M5Row x 2
        └── Raw data blocks x 5
```

## Hooks

### useCopiedIpState
Manages copy-to-clipboard state with auto-reset.

```typescript
const { copiedIp, copyIp } = useCopiedIpState(ip);
```

## Utils

### deviceFamily
Detects device family from model or firmware prefix.

```typescript
const family = detectFamily(dev); // Returns 'ac' | 'm5' | 'unknown'
```

### formatters
Formatting utilities for consistent data display:
- `formatMB()`, `formatMemoryMB()`
- `formatDBm()`, `formatMHz()`, `formatPercent()`
- `formatMbps()`, `formatBool()`, `formatMs()`
- `formatMeter()`, `formatDegrees()`

### styles
Centralized Tailwind class definitions by component:
- `modalContainerStyles`: Container and modal wrapper
- `headerStyles`: Header component styles
- `contentStyles`: Scrollable content
- `sectionStyles`: Section headers and grids
- `rowStyles`: Label and value styling
- `ifaceStyles`: Interface block styling
- `rawDataStyles`: Raw command output styling

## Data Requirements

The component requires `dev.cachedStats` with type `AntennaStats`:

```typescript
interface AntennaStats {
  deviceName?: string;
  deviceModel?: string;
  firmwareVersion?: string;
  fwPrefix?: string;
  uptimeStr?: string;
  deviceDate?: string;
  cpuLoad?: number;
  loadAvg?: string;
  networkMode?: string;
  memTotalKb?: number;
  memFreeKb?: number;
  memBuffersKb?: number;
  memCachedKb?: number;
  memoryPercent?: number;
  // ... 100+ more properties
  ifaceDetails?: Array<{
    ifname: string;
    hwaddr?: string;
    ipaddr?: string;
    mtu?: number;
    enabled?: boolean;
    // ... more interface properties
  }>;
  ifaceTraffic?: Record<string, { rxBytes: number; rxPackets: number; txBytes: number; txPackets: number }>;
  _rawMcaCli?: string;
  _rawUname?: string;
  _rawIwconfig?: string;
  _rawWstalist?: string;
  _rawMeminfo?: string;
  _rawRoutes?: string;
}
```

## Design Decisions

1. **Section-based Organization**: Data grouped by logical domain (System, Wireless, etc.)
2. **Family-specific Rendering**: AC and M5 devices show device-specific fields only
3. **Raw Command Output**: SSH/direct command outputs displayed as-is in preformatted blocks
4. **Formatting Centralization**: All data formatting in dedicated `formatters.ts` utility
5. **Accessible Styling**: Color-coded sections with semantic icons
6. **Modal Pattern**: Uses fixed positioning with backdrop for UI consistency

## Performance Notes

- Component memoization not needed (props rarely change during modal visibility)
- Large data sets (many interfaces) handled with flex scroll
- No virtual scrolling needed (typical data ~2-5KB)
- FormatRe calls are pure functions, safe for rendering

## Integration Notes

- Modal renders outside DOM hierarchy via absolute positioning
- Backdrop click triggers `onClose()` callback
- Parent component manages `isOpen` state
- Compatible with both ScannedDevice (network scan) and SavedDevice (stored)

## Styling

### Color Scheme by Section
- **System**: Blue (`bg-blue-50`, `border-blue-200`)
- **Wireless**: Sky blue (`bg-sky-50`, `border-sky-200`)
- **Interfaces**: Violet (`bg-violet-50`, `border-violet-200`)
- **Services**: Emerald (`bg-emerald-50`, `border-emerald-200`)

### Typography
- Sections: 9-12px, uppercase, bold tracking
- Values: Monospace, 11px, semibold
- Raw output: 9px monospace, scrollable

## Future Enhancements

- Search/filter within modal
- Export data as JSON/CSV
- Comparison between multiple devices
- Real-time data refresh polling
- Mobile-optimized layout
