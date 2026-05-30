interface ProvisionErrorProps {
  error: string;
  isProvisioning: boolean;
}

export function ProvisionError({ error, isProvisioning }: ProvisionErrorProps) {
  if (!error || isProvisioning) return null;

  return (
    <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl">
      <p className="text-xs font-semibold text-rose-600">⚠ {error}</p>
    </div>
  );
}
