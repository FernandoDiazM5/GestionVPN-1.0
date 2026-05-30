interface ErrorSectionProps {
  error: string;
}

export default function ErrorSection({ error }: ErrorSectionProps) {
  if (!error) return null;

  return (
    <div className="mx-4 mb-3 px-3 py-2 bg-rose-50 dark:bg-rose-900/50 border border-rose-200 dark:border-rose-700 rounded-xl">
      <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>
    </div>
  );
}
