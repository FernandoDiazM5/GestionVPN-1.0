import { Lock, User, Server } from 'lucide-react';

interface CredentialsFormProps {
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  isConnecting: boolean;
  needsSetup: boolean;
}

export function CredentialsForm({
  username,
  setUsername,
  password,
  setPassword,
  onSubmit,
  isConnecting,
  needsSetup,
}: CredentialsFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Usuario {needsSetup && 'Administrador'}
        </label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            required
            placeholder={needsSetup ? "admin" : "juan_soporte"}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-field pl-10 font-mono"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Contraseña
        </label>
        <div className="relative">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isConnecting || !username || !password}
        className="w-full relative flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl font-semibold text-sm transition-all focus:ring-4 focus:ring-indigo-100 disabled:opacity-70 disabled:cursor-not-allowed group overflow-hidden mt-6"
      >
        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
        <Server className="w-4 h-4 relative z-10" />
        <span className="relative z-10">
          {needsSetup ? 'Crear Cuenta Administrador' : 'Iniciar Sesión'}
        </span>
      </button>
    </form>
  );
}
