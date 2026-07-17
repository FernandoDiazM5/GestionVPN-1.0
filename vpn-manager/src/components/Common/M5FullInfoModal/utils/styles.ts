export const modalContainerStyles = {
  container: 'modal-overlay',
  modal: 'modal-panel modal-panel-3xl h-[min(92vh,860px)] max-h-[92vh]',
};

export const headerStyles = {
  container: 'modal-header-decorated modal-header-slate flex-col items-stretch sm:flex-row sm:items-center',
  iconWrapper: 'modal-header-icon',
  titleSection: 'flex items-center gap-3',
  titleContainer: 'flex items-center gap-2',
  subtitle: 'flex items-center gap-2 mt-0.5',
  closeButton: 'modal-header-close',
};

export const contentStyles = {
  container: 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 space-y-4 [scrollbar-gutter:stable]',
};

export const sectionStyles = {
  container: 'rounded-2xl border p-4 shadow-sm',
  header: 'flex items-center gap-2 mb-4 border-b border-current/15 pb-3',
  title: 'text-xs font-bold uppercase tracking-widest',
  grid: 'grid grid-cols-1 gap-2 md:grid-cols-2',
};

export const rowStyles = {
  container: 'min-w-0 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/45',
  label: 'block text-3xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400',
  value: 'mt-1 block break-words font-mono text-2xs font-semibold text-slate-800 dark:text-slate-100',
};

export const ifaceStyles = {
  container: 'col-span-full border border-violet-100 rounded-lg p-3 mb-2 bg-white dark:bg-slate-800/60 dark:border-violet-500/30',
  header: 'flex items-center gap-2 mb-2',
  ifname: 'text-2xs font-bold text-violet-600 dark:text-violet-400 uppercase font-mono',
  hwaddr: 'text-2xs text-slate-400 font-mono',
  ipaddr: 'text-2xs font-mono font-bold text-sky-600 dark:text-sky-400 ml-auto',
  grid: 'grid grid-cols-1 gap-2 md:grid-cols-2',
};

export const rawDataStyles = {
  container: 'col-span-full mt-2',
  label: 'text-3xs font-bold uppercase mb-1',
  pre: 'text-3xs font-mono bg-white rounded-lg p-2 overflow-auto whitespace-pre-wrap border dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300',
};
