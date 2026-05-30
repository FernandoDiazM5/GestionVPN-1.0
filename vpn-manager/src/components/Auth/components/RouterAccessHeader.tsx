import { Radio, ShieldCheck } from 'lucide-react';

interface RouterAccessHeaderProps {
  needsSetup: boolean;
}

export function RouterAccessHeader({ needsSetup }: RouterAccessHeaderProps) {
  return (
    <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 px-8 pt-10 pb-12 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
      <div className="relative z-10">
        <div className="flex items-center space-x-3 mb-4">
          <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">
            {needsSetup ? <ShieldCheck className="w-6 h-6 text-white" /> : <Radio className="w-6 h-6 text-white" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">MikroTikVPN</h1>
            <p className="text-indigo-200 text-sm">{needsSetup ? 'Configuración Inicial' : 'Remote Core Manager'}</p>
          </div>
        </div>
        <p className="text-indigo-100 text-sm mt-2">
          {needsSetup ? 'Cree la cuenta administrativa maestra para acceder al sistema de gestión.' : 'Inicie sesión con su cuenta para acceder al panel.'}
        </p>
      </div>
    </div>
  );
}
