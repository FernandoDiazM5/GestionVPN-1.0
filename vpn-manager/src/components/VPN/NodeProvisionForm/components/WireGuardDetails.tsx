import { Shield } from 'lucide-react';

interface WireGuardDetailsProps {
  serverPublicKey: string;
  wgPort: number | null;
}

export function WireGuardDetails({ serverPublicKey, wgPort }: WireGuardDetailsProps) {
  if (!serverPublicKey) return null;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mt-2 dark:bg-violet-500/10 dark:border-violet-500/30">
      <p className="text-xs font-semibold text-violet-700 mb-1 flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5" />
        Clave Pública del Servidor (para configurar el CPE):
      </p>
      <code className="text-2xs font-mono text-violet-900 break-all block mb-2">{serverPublicKey}</code>
      <button
        onClick={() => navigator.clipboard.writeText(serverPublicKey)}
        className="text-2xs text-violet-600 hover:text-violet-800 font-semibold"
      >
        Copiar
      </button>
      {wgPort && (
        <div className="mt-2 pt-2 border-t border-violet-200">
          <p className="text-2xs font-bold text-violet-500 uppercase tracking-wider mb-1">Listen Port</p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-violet-900">{wgPort}</code>
            <button
              onClick={() => navigator.clipboard.writeText(String(wgPort))}
              className="text-2xs text-violet-600 hover:text-violet-800 font-semibold"
            >
              Copiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
