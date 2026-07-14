const overlayStack: symbol[] = [];

interface BackgroundSnapshot {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
}

let backgroundSnapshots: BackgroundSnapshot[] = [];
let previousOverflow = '';
let previousPaddingRight = '';

export function getOverlayRoot(): HTMLElement {
  let root = document.querySelector<HTMLElement>('[data-overlay-root]');
  if (!root) {
    root = document.createElement('div');
    root.dataset.overlayRoot = '';
    document.body.appendChild(root);
  }
  return root;
}

function lockBackground() {
  const root = getOverlayRoot();
  backgroundSnapshots = Array.from(document.body.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== root)
    .map(element => ({
      element,
      inert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }));

  for (const { element } of backgroundSnapshots) {
    element.setAttribute('inert', '');
    element.setAttribute('aria-hidden', 'true');
  }

  previousOverflow = document.body.style.overflow;
  previousPaddingRight = document.body.style.paddingRight;
  const scrollbarWidth = document.documentElement.clientWidth > 0
    ? Math.max(0, window.innerWidth - document.documentElement.clientWidth)
    : 0;

  document.body.style.overflow = 'hidden';
  if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
}

function unlockBackground() {
  for (const { element, inert, ariaHidden } of backgroundSnapshots) {
    if (inert) element.setAttribute('inert', '');
    else element.removeAttribute('inert');

    if (ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', ariaHidden);
  }

  backgroundSnapshots = [];
  document.body.style.overflow = previousOverflow;
  document.body.style.paddingRight = previousPaddingRight;
}

export function mountOverlay(id: symbol) {
  overlayStack.push(id);
  if (overlayStack.length === 1) lockBackground();
}

export function unmountOverlay(id: symbol) {
  const index = overlayStack.lastIndexOf(id);
  if (index >= 0) overlayStack.splice(index, 1);
  if (overlayStack.length === 0) unlockBackground();
}

export function isTopOverlay(id: symbol) {
  return overlayStack.at(-1) === id;
}
