import Spinner from '../../../Common/Spinner';

export function SettingsLoadingState() {
  return (
    <div className="flex justify-center items-center h-48">
      <Spinner size="lg" label="Cargando ajustes…" />
    </div>
  );
}
