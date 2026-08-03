import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'warning' | 'success' | 'info' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  variant = 'outline',
  size = 'md',
  leadingIcon: LeadingIcon,
  trailingIcon: TrailingIcon,
  loading = false,
  loadingLabel = 'Procesando…',
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const iconClass = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        `btn-${variant}`,
        size === 'icon' ? 'btn-icon min-h-11 min-w-11' : `btn-${size}`,
        'inline-flex items-center justify-center whitespace-nowrap font-semibold',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className={cx(iconClass, 'animate-spin')} aria-hidden="true" /> : LeadingIcon ? <LeadingIcon className={iconClass} aria-hidden="true" /> : null}
      {loading ? loadingLabel : children}
      {!loading && TrailingIcon ? <TrailingIcon className={iconClass} aria-hidden="true" /> : null}
    </button>
  );
}

interface SectionCardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'article' | 'div';
}

export function SectionCard({ as: Component = 'section', className, ...props }: SectionCardProps) {
  return <Component className={cx('card', className)} {...props} />;
}

interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description: ReactNode;
  icon: LucideIcon;
  aside?: ReactNode;
  children?: ReactNode;
  titleId?: string;
}

export function PageHeader({ title, description, icon: Icon, aside, children, titleId, className, ...props }: PageHeaderProps) {
  return (
    <SectionCard className={cx('overflow-hidden', className)} aria-labelledby={titleId} {...props}>
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/15">
            <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 id={titleId} className="truncate text-lg font-bold text-slate-900 dark:text-slate-100 sm:text-xl">{title}</h1>
            <p className="mt-1 text-sm font-normal text-slate-600 dark:text-slate-400">{description}</p>
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {children}
    </SectionCard>
  );
}

type EmptyTone = 'brand' | 'warning' | 'neutral';
interface EmptyStateProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  tone?: EmptyTone;
}

const EMPTY_TONES: Record<EmptyTone, string> = {
  brand: 'bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-400',
  warning: 'bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400',
  neutral: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export function EmptyState({ icon: Icon, title, description, actions, tone = 'brand', className, ...props }: EmptyStateProps) {
  return (
    <SectionCard className={cx('flex flex-col items-center px-6 py-12 text-center', className)} {...props}>
      <div className={cx('flex h-16 w-16 items-center justify-center rounded-2xl', EMPTY_TONES[tone])}>
        <Icon className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-2 max-w-md text-sm font-normal leading-6 text-slate-600 dark:text-slate-400">{description}</p>
      {actions ? <div className="mt-6 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">{actions}</div> : null}
    </SectionCard>
  );
}

type StatusTone = 'success' | 'warning' | 'info' | 'neutral';
interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  dot?: boolean;
  pulse?: boolean;
}

const STATUS_TONES: Record<StatusTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  info: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function StatusBadge({ tone = 'neutral', dot = false, pulse = false, className, children, ...props }: StatusBadgeProps) {
  const dotColor = tone === 'success' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : tone === 'info' ? 'bg-sky-500' : 'bg-slate-400';
  return (
    <span className={cx('inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold', STATUS_TONES[tone], className)} {...props}>
      {dot ? <span className={cx('h-2 w-2 rounded-full', dotColor, pulse && 'motion-safe:animate-pulse')} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void;
  containerClassName?: string;
}

export function SearchInput({ value, onClear, containerClassName, className, ...props }: SearchInputProps) {
  const hasValue = typeof value === 'string' && value.length > 0;
  return (
    <div className={cx('relative min-w-0', containerClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      <input type="search" value={value} className={cx('min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500', className)} {...props} />
      {hasValue && onClear ? (
        <button type="button" onClick={onClear} aria-label="Limpiar búsqueda" title="Limpiar búsqueda" className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export interface SegmentedItem<T extends string> {
  value: T;
  label: string;
  title?: string;
  icon?: LucideIcon;
  selectedClassName?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  items: readonly SegmentedItem<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({ value, items, onChange, ariaLabel, className, disabled = false }: SegmentedControlProps<T>) {
  return (
    <div className={cx('grid min-h-11 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700', className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} role="group" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const selected = value === item.value;
        const Icon = item.icon;
        return (
          <button key={item.value} type="button" onClick={() => onChange(item.value)} disabled={disabled} aria-pressed={selected} title={item.title} className={cx('flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-semibold transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500', index > 0 && 'border-l border-slate-200 dark:border-slate-700', selected ? (item.selectedClassName || 'bg-indigo-600 text-white') : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800')}>
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
