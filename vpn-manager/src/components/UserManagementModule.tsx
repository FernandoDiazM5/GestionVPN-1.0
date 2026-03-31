import { useState, useEffect } from 'react';
import { Users, UserPlus, Save, Trash2, Shield, Loader2, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../utils/apiClient';
import { API_BASE_URL } from '../config';
import { useVpn } from '../context/VpnContext';

interface UserInfo {
  id: number;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  created_at: number;
}

export default function UserManagementModule() {
  const { credentials } = useVpn();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState(false);
  const [view, setView] = useState<'list' | 'form'>('list');

  // Form state
  const [formId, setFormId] = useState<number | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'operator' | 'viewer'>('viewer');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/users/list`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      } else setErrorMsg(data.message);
    } catch (err) {
      setErrorMsg('Error fatal obteniendo usuarios');
    }
    setIsLoading(false);
  };

  const handleDelete = async (user: UserInfo) => {
    if (user.role === 'admin' && users.filter(u => u.role === 'admin').length === 1) {
      return alert('No puedes borrar al único administrador.');
    }
    if (user.username === credentials?.user) {
      return alert('No puedes borrar tu propia cuenta de sesión actual.');
    }
    if (!confirm(`¿Estás seguro de que deseas revocar permanentemente a ${user.username}?`)) return;

    setIsActioning(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/users/delete`, { method: 'POST', body: JSON.stringify({ id: user.id }) });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        loadUsers();
      } else alert(data.message);
    } catch (e: any) { alert(e.message); }
    setIsActioning(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActioning(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const endpoint = formId ? `${API_BASE_URL}/api/users/edit` : `${API_BASE_URL}/api/users/add`;
      const payload: any = { username: formUsername, role: formRole };
      if (formId) payload.id = formId;
      if (formPassword) payload.password = formPassword;

      const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(data.message);
        setView('list');
        loadUsers();
      } else {
        setErrorMsg(data.message || 'Error en validación');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Error de red');
    }
    setIsActioning(false);
  };

  const openForm = (u?: UserInfo) => {
    setErrorMsg('');
    setSuccessMsg('');
    if (u) {
      setFormId(u.id);
      setFormUsername(u.username);
      setFormRole(u.role);
      setFormPassword('');
    } else {
      setFormId(null);
      setFormUsername('');
      setFormRole('viewer');
      setFormPassword('');
    }
    setView('form');
  };

  if (view === 'form') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{formId ? 'Editar Operador' : 'Nuevo Operador'}</h2>
              <p className="text-sm text-slate-500 font-medium">Asignación de rol y credenciales.</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm font-bold rounded-lg">{errorMsg}</div>}
          
          <form onSubmit={handleSave} className="space-y-6 max-w-lg">
            <div>
               <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre de Usuario</label>
               <input autoFocus type="text" required value={formUsername} onChange={e => setFormUsername(e.target.value)} className="input-field h-11" placeholder="juan_operador" />
            </div>

            <div>
               <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contraseña {formId && '(Opcional — Déjalo en blanco para no cambiar)'}</label>
               <input type="password" required={!formId} value={formPassword} onChange={e => setFormPassword(e.target.value)} className="input-field h-11" placeholder="••••••••" minLength={6} />
            </div>

            <div>
               <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nivel de Acceso (Rol)</label>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                 {[
                   { id: 'admin', label: 'Admin', desc: 'Acceso Total' },
                   { id: 'operator', label: 'Operator', desc: 'Gestiona Nodos' },
                   { id: 'viewer', label: 'Viewer', desc: 'Solo Lectura' }
                 ].map(r => (
                   <label key={r.id} className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${formRole === r.id ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300'}`}>
                     <div className="flex items-center gap-2 mb-1">
                        <input type="radio" className="hidden" name="role" checked={formRole === r.id} onChange={() => setFormRole(r.id as any)} />
                        <span className="font-bold text-sm text-slate-800">{r.label}</span>
                     </div>
                     <span className="text-[11px] font-medium text-slate-500">{r.desc}</span>
                   </label>
                 ))}
               </div>
            </div>

            <div className="pt-4 border-t flex justify-end">
              <button type="submit" disabled={isActioning} className="btn-primary">
                 {isActioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                 <span>{formId ? 'Actualizar Cuenta' : 'Crear Cuenta'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
      <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
         <div className="flex items-center gap-3">
          <div className="bg-indigo-50 p-2 rounded-lg">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Gestión de Personal</h2>
            <p className="text-sm text-slate-500 font-medium">Administra los accesos de tus colaboradores a la plataforma.</p>
          </div>
         </div>
         <button onClick={() => openForm()} className="btn-primary text-xs py-2 px-3">
             <UserPlus className="w-3.5 h-3.5" /> <span>Invitar Operador</span>
         </button>
      </div>

      <div className="p-0 overflow-x-auto">
        {successMsg && <div className="m-4 p-3 bg-emerald-50 text-emerald-700 text-sm font-bold flex gap-2 rounded-lg"><Shield className="w-4 h-4"/>{successMsg}</div>}
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-slate-50 border-b border-slate-100 uppercase text-[10px] font-extrabold text-slate-500 tracking-wider">
                    <th className="px-6 py-3">Nombre del Colaborador</th>
                    <th className="px-6 py-3">Nivel de Acceso</th>
                    <th className="px-6 py-3">Vigente Desde</th>
                    <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
            </thead>
            <tbody>
                {isLoading ? (
                    <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Cargando directorio...
                        </td>
                    </tr>
                ) : users.length === 0 ? (
                    <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-sm font-medium">No hay usuarios registrados</td>
                    </tr>
                ) : users.map(u => (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-6 py-3 font-bold text-slate-800 text-sm flex items-center gap-2">
                            {u.username === credentials?.user && <span className="w-2 h-2 rounded-full bg-emerald-500" title="Eres tú" />}
                            {u.username}
                        </td>
                        <td className="px-6 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                u.role === 'admin' ? 'bg-indigo-100 text-indigo-800' : 
                                u.role === 'operator' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                                {u.role}
                            </span>
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-500 font-medium whitespace-nowrap">
                            {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-right space-x-2 whitespace-nowrap">
                            <button onClick={() => openForm(u)} disabled={isActioning} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 rounded-lg transition-colors font-semibold text-xs inline-flex items-center">
                                Editar
                            </button>
                            <button onClick={() => handleDelete(u)} disabled={isActioning} className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}
