// Migrado al sistema de diseño (§50): overlay/panel canónicos + botones .btn-*.
// Antes era un sistema paralelo (rounded-3xl, hover danger invertido 500→400,
// grid 50/50, clases animate-in muertas). Ahora hereda animación de entrada,
// backdrop, dark mode, focus ring y active:scale de las clases del sistema.
export const confirmModalStyles = {
  container: 'modal-overlay',
  modal: 'modal-panel modal-panel-sm relative p-6',
  closeButton: 'absolute top-4 right-4 btn-ghost btn-icon',
  headerContainer: 'flex items-center space-x-3 mb-4',
  iconWrapper: 'bg-rose-100 dark:bg-rose-950/60 p-2.5 rounded-2xl shrink-0',
  headerTitle: 'font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight',
  content: 'text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed',
  footer: 'flex items-center justify-end gap-2',
  cancelButton: 'btn-ghost btn-md',
  confirmButton: 'btn-danger btn-md',
};
