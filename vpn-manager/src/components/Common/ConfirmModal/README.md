# ConfirmModal Component

## Overview

A reusable confirmation modal component for asking user confirmation before destructive actions. Features dark mode support, smooth animations, and keyboard-friendly design.

## Structure

```
ConfirmModal/
├── ConfirmModal.tsx          # Main orchestrator component
├── index.ts                  # Public export
├── types.ts                  # Type definitions
├── constants.ts              # Constants (labels)
├── components/
│   ├── CloseButton.tsx       # Close button (X)
│   ├── ModalBackdrop.tsx     # Backdrop with blur effect
│   ├── ModalHeader.tsx       # Header with icon and title
│   ├── ModalContent.tsx      # Message text
│   └── ModalFooter.tsx       # Cancel and Confirm buttons
├── utils/
│   └── styles.ts             # Tailwind CSS class definitions
└── README.md                 # This file
```

## Usage

### Basic Example

```typescript
import ConfirmModal from '@/components/Common/ConfirmModal';

export default function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Delete Item</button>
      
      <ConfirmModal
        isOpen={isOpen}
        title="Delete Item"
        message="Are you sure you want to delete this item? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          // Handle deletion
          setIsOpen(false);
        }}
        onCancel={() => setIsOpen(false)}
      />
    </>
  );
}
```

## Props

```typescript
interface ConfirmModalProps {
  isOpen: boolean;                    // Controls modal visibility
  title: string;                      // Modal title (e.g., "Delete Item")
  message: string;                    // Confirmation message
  confirmLabel?: string;              // Custom confirm button label (default: "Confirmar")
  onConfirm: () => void;             // Callback when user clicks confirm
  onCancel: () => void;              // Callback when user clicks cancel or backdrop
}
```

## Features

- **Dark Mode**: Full Tailwind dark mode support with `dark:` utilities
- **Animations**: Smooth fade-in and zoom-in animations
- **Keyboard Friendly**: Close button and clickable backdrop
- **Responsive**: Works on all screen sizes with padding and max-width constraints
- **Accessible**: Semantic button roles, clear visual hierarchy

## Sub-Components

### CloseButton
- Simple X button to close the modal
- Props: `onClick`

### ModalBackdrop
- Dark semi-transparent backdrop with blur effect
- Clickable to cancel (dismissible)
- Props: `onClick`

### ModalHeader
- Displays title with warning icon
- Props: `title`

### ModalContent
- Message text content
- Props: `message`

### ModalFooter
- Cancel and Confirm buttons
- Props: `confirmLabel`, `onCancel`, `onConfirm`

## Styling

All styles are defined in `utils/styles.ts` using Tailwind CSS classes. Key style objects:

- `container`: Outer wrapper with fixed positioning
- `backdrop`: Dark overlay with blur
- `modal`: Main modal box with shadows and animations
- `headerContainer`: Flex layout for title and icon
- `footer`: Grid layout for buttons

## Design Decisions

1. **Separation of Concerns**: Each UI section is its own component
2. **Style Centralization**: All Tailwind classes in `utils/styles.ts` for consistency
3. **Type Safety**: Full TypeScript with interfaces
4. **Portal Rendering**: Uses `createPortal` to render outside DOM hierarchy
5. **No Internal State**: All state managed by parent component

## Dark Mode

The component automatically responds to the `dark:` class on the html element. Example colors:

- Background: `bg-white dark:bg-slate-900`
- Text: `text-slate-800 dark:text-slate-100`
- Borders: `border-slate-200 dark:border-slate-700`
- Buttons: `bg-slate-100 dark:bg-slate-800`

## Integration Notes

- The modal renders to `document.body` using `createPortal`
- Parent component controls visibility via `isOpen` prop
- Both backdrop and close button trigger `onCancel`
- No default keyboard shortcuts (Enter/Escape) - implement in parent if needed

## Examples

### Delete Confirmation
```typescript
<ConfirmModal
  isOpen={showDeleteConfirm}
  title="Delete User"
  message="This user account will be permanently deleted. Are you sure?"
  confirmLabel="Delete User"
  onConfirm={handleDeleteUser}
  onCancel={() => setShowDeleteConfirm(false)}
/>
```

### Logout Confirmation
```typescript
<ConfirmModal
  isOpen={showLogoutConfirm}
  title="Logout"
  message="Are you sure you want to logout?"
  confirmLabel="Logout"
  onConfirm={handleLogout}
  onCancel={() => setShowLogoutConfirm(false)}
/>
```
