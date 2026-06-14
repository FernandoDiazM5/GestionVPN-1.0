interface ProvisionErrorProps {
  error: string;
  isProvisioning: boolean;
}

export function ProvisionError({ error, isProvisioning }: ProvisionErrorProps) {
  if (!error || isProvisioning) return null;

  return (
    <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl dark:bg-rose-500/10 dark:border-rose-500/30">
      <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">⚠ {error}</p>
    </div>
  );
}
