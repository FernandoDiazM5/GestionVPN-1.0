# NetworkDevicesModule Extraction Guide

## Overview

This folder contains the **modularized structure** for `NetworkDevicesModule.tsx`.

**Original file preserved:** `../NetworkDevicesModule.tsx` (NOT modified, 100% functional)

## Current Status

✅ **Phase 1 Complete**: Core types, constants, and utility functions extracted
⏳ **Phase 2-5 Pending**: Components, hooks, services ready to be extracted

## Architecture

```
NetworkDevicesModule/
├── types.ts                    # All interfaces (ColumnDef, SshAuthStatus, etc.)
├── constants.ts                # Constants & helpers (estimateIpCount, ipInCidr, fmtBytes, fmtPkts)
├── index.ts                    # Public exports
│
├── components/
│   └── RawBlock.tsx            # Collapsible raw data block (DONE)
│       ├── AddDeviceModal.tsx  # (PENDING - copy from lines 387-522)
│       ├── DeviceCardModal.tsx # (PENDING - copy from lines 533-556)
│       ├── DeviceStatusPanel.tsx # (PENDING - copy from lines 565-954)
│       ├── SshDataModal.tsx    # (PENDING - copy from lines 1002-1236)
│       ├── ColumnPicker.tsx    # (PENDING - copy from lines 1244-1353)
│       └── DiagnosticTable.tsx # (PENDING - extracted from main component)
│
├── hooks/                      # (PENDING - 8 custom hooks)
│   ├── useScanState.ts
│   ├── useScanResults.ts
│   ├── useSshAuth.ts
│   ├── useDeviceManagement.ts
│   ├── useColumnPreferences.ts
│   ├── useSortFilter.ts
│   ├── useNodeSelection.ts
│   └── useToast.ts
│
├── utils/                      # (PENDING - 5 service files)
│   ├── scanService.ts
│   ├── authService.ts
│   ├── deviceService.ts
│   ├── ipValidation.ts
│   └── formatters.ts
│
├── constants/                  # (PENDING - 2 files)
│   ├── columns.ts             # COLUMN_DEFS array (21 columns)
│   └── storage.ts             # Storage keys & messages
│
├── NetworkDevicesModule.tsx    # (PENDING - refactored, imports from modules)
├── EXTRACTION_PLAN.md          # Initial extraction plan
├── EXTRACTION_STATUS.md        # Extraction progress tracker
└── README.md                   # This file
```

## Line Mapping Reference

When extracting from `../NetworkDevicesModule.tsx`:

| Component | Lines | Status |
|-----------|-------|--------|
| AddDeviceModal | 387-522 | ⏳ |
| DeviceCardModal | 533-556 | ⏳ |
| DeviceStatusPanel | 565-954 | ⏳ |
| RawBlock | 968-996 | ✅ Done |
| SshDataModal | 1002-1236 | ⏳ |
| ColumnPicker | 1244-1353 | ⏳ |
| Main component | 1356-2689 | ⏳ |

## Guarantee

- ✅ **Zero logic changes** - Code is copied exactly as-is
- ✅ **Same behavior** - No refactoring, only reorganization
- ✅ **Original preserved** - `../NetworkDevicesModule.tsx` remains untouched
- ✅ **Gradual migration** - Update imports at your own pace

## Next Steps (for manual or automated completion)

1. Copy AddDeviceModal component to `components/AddDeviceModal.tsx`
2. Copy DeviceCardModal component to `components/DeviceCardModal.tsx`
3. Copy DeviceStatusPanel component to `components/DeviceStatusPanel.tsx`
4. Copy SshDataModal component to `components/SshDataModal.tsx`
5. Copy ColumnPicker component to `components/ColumnPicker.tsx`
6. Extract hooks to `hooks/*.ts`
7. Extract services to `utils/*.ts`
8. Extract COLUMN_DEFS to `constants/columns.ts`
9. Create refactored `NetworkDevicesModule.tsx` that imports from modules

## Type Safety

All TypeScript types are in `types.ts`:
```typescript
- ColumnDef
- SshAuthStatus
- AddDeviceModalProps
- DeviceCardModalProps
- ScanCred
- DeviceStatusPanelProps
- SshDataModalProps
- ColumnPickerProps
- RawBlockProps
- ScanState
```

## Testing the Migration

Once all files are created and `NetworkDevicesModule.tsx` is updated with imports:

```bash
npx tsc --noEmit  # Verify TypeScript compilation
npm run dev       # Test in browser
```

## Rollback

If any issues arise, the original file at `../NetworkDevicesModule.tsx` is unchanged and fully functional.
