import { rowStyles } from '../utils/styles';

export default function M5Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <>
      <span className={rowStyles.label}>{label}:</span>
      <span className={rowStyles.value}>{String(value)}</span>
    </>
  );
}
