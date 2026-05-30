export const confirmModalStyles = {
  container: 'fixed inset-0 z-50 flex items-center justify-center p-4',
  backdrop: 'absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200',
  modal: 'relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200',
  closeButton: 'absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
  headerContainer: 'flex items-center space-x-3 mb-4',
  iconWrapper: 'bg-rose-100 dark:bg-rose-950/60 p-2.5 rounded-2xl shrink-0',
  headerTitle: 'font-bold text-slate-800 dark:text-slate-100 text-base leading-tight',
  content: 'text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed',
  footer: 'grid grid-cols-2 gap-3',
  cancelButton: 'py-2.5 px-4 rounded-2xl font-semibold text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors',
  confirmButton: 'py-2.5 px-4 rounded-2xl font-bold text-sm bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-500/20 transition-colors',
};
