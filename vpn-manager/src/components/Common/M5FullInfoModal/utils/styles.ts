export const modalContainerStyles = {
  container: 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4 py-6 animate-in fade-in duration-200',
  modal: 'bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200 dark:bg-slate-900 dark:border dark:border-slate-800',
};

export const headerStyles = {
  container: 'flex items-center justify-between bg-slate-800 rounded-t-2xl px-5 py-4 shrink-0',
  iconWrapper: 'w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center',
  titleSection: 'flex items-center gap-3',
  titleContainer: 'flex items-center gap-2',
  subtitle: 'flex items-center gap-2 mt-0.5',
  closeButton: 'p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg',
};

export const contentStyles = {
  container: 'overflow-y-auto flex-1 p-5 space-y-4',
};

export const sectionStyles = {
  container: 'rounded-xl border p-4',
  header: 'flex items-center gap-2 mb-3',
  title: 'text-xs font-bold uppercase tracking-widest',
  grid: 'grid grid-cols-2 gap-x-6 gap-y-0.5',
};

export const rowStyles = {
  label: 'text-2xs text-slate-500 truncate',
  value: 'text-2xs font-mono font-semibold text-slate-800 truncate',
};

export const ifaceStyles = {
  container: 'col-span-2 border border-violet-100 rounded-lg p-3 mb-2 bg-white dark:bg-slate-800/60 dark:border-violet-500/30',
  header: 'flex items-center gap-2 mb-2',
  ifname: 'text-2xs font-bold text-violet-600 uppercase font-mono',
  hwaddr: 'text-2xs text-slate-400 font-mono',
  ipaddr: 'text-2xs font-mono font-bold text-sky-600 ml-auto',
  grid: 'grid grid-cols-2 gap-x-6 gap-y-0.5',
};

export const rawDataStyles = {
  container: 'col-span-2 mt-2',
  label: 'text-[9px] font-bold uppercase mb-1',
  pre: 'text-[9px] font-mono bg-white rounded-lg p-2 overflow-x-auto whitespace-pre-wrap border dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300',
};
