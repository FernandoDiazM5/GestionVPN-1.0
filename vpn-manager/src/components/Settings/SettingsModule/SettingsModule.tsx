import {
  SettingsHeader,
  SettingsForm,
  SettingsMessages,
  SettingsLoadingState,
  ScanModeToggle,
} from './components';
import { useLoadSettings, useSaveSettings } from './hooks';

export default function SettingsModule() {
  const loadState = useLoadSettings();
  const saveState = useSaveSettings();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveState.handleSave(loadState.settings);
  };

  // La gestión de usuarios/roles vive ahora en los paneles "Moderadores"
  // (Administrador) y "Equipo" (Moderador). Aquí solo va la configuración global.
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="card overflow-hidden">
        <SettingsHeader />
        <div className="p-6">
          {loadState.isLoading ? (
            <SettingsLoadingState />
          ) : (
            <>
              <SettingsMessages
                successMsg={saveState.successMsg}
                errorMsg={loadState.errorMsg || saveState.errorMsg}
              />
              <SettingsForm
                settings={loadState.settings}
                onSettingsChange={loadState.setSettings}
                onSubmit={handleSave}
                isSaving={saveState.isSaving}
              />
            </>
          )}
        </div>
      </div>

      {/* Modo de escaneo Producción(VPS) ↔ Local — persiste al instante */}
      {!loadState.isLoading && (
        <ScanModeToggle
          scanMode={loadState.settings.scan_mode ?? 'vps'}
          localScanIp={loadState.settings.local_scan_ip ?? ''}
          onChange={(patch) => loadState.setSettings({ ...loadState.settings, ...patch })}
        />
      )}
    </div>
  );
}
