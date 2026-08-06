import { Fragment } from 'react';
import { Play, ShieldOff, Loader2, Router, Clock } from 'lucide-react';
import {
  useNodeActivation,
  useNodeNameEdit,
  useSshCredentials,
  useWireGuardPeer,
  useTunnelCountdown,
  useKebabMenu,
  useLogsAndRepair,
} from './hooks';
import {
  NodeCardStatusIcon,
  NodeCardNameSection,
  NodeCardStatusRow,
  NodeCardLogsSection,
  NodeCardSshForm,
  NodeCardWgPeerForm,
  NodeCardKebabMenu,
} from './components';
import type { NodeCardProps } from './types';

export default function NodeCard({
  node,
  rowIndex,
  onEdit,
  onDelete,
  onScript,
  onRename,
  onHistory,
  tags = [],
  onTagClick,
  onDiagnose,
  canManage = true,
  visibleCols,
  mobile = false,
}: NodeCardProps) {
  const {
    isActivating,
    isDeactivating,
    logs,
    handleActivate,
    handleDeactivate,
    isThisNodeActive,
    isPending,
    setLogs,
    clearLogs,
    scheduleLogsClear,
  } = useNodeActivation(node);

  const {
    editingName,
    nameInput,
    savingName,
    nameInputRef,
    setNameInput,
    startEditName,
    cancelEditName,
    saveNodeName,
  } = useNodeNameEdit(node, onRename);

  const {
    showSshForm,
    sshCredsArr,
    setSshCredsArr,
    sshLoading,
    sshSaved,
    showPasswords,
    setShowPasswords,
    openSshForm,
    closeSshForm,
    saveSshCreds,
    updateCred,
    removeCred,
    moveCred,
  } = useSshCredentials(node);

  const {
    showWgPeerForm,
    setShowWgPeerForm,
    wgPeerKey,
    setWgPeerKey,
    isSettingPeer,
    handleSetWgPeer,
  } = useWireGuardPeer(node, (msg) => setLogs(prev => [...prev.slice(-8), msg]));

  const countdown = useTunnelCountdown(isThisNodeActive);

  const {
    showKebab,
    setShowKebab,
    kebabCoords,
    kebabRef,
    dropdownRef,
    handleKebabClick,
  } = useKebabMenu();

  const {
    isRepairing,
    logsEndRef,
    handleRepair: repairFunc,
  } = useLogsAndRepair(node);

  const addLog = (msg: string) => setLogs(prev => [...prev.slice(-8), msg]);

  const showLogs = logs.length > 0 || isPending;
  const canActivate = !isPending && !!node.nombre_vrf && !node.disabled && node.running;
  const accessBlockReason = !node.nombre_vrf
    ? 'Este sitio no tiene una ruta de acceso asignada'
    : node.disabled
      ? 'Este sitio no está disponible'
      : !node.running
        ? 'Este sitio está fuera de línea'
        : null;

  const rowBg = isThisNodeActive
    ? 'bg-emerald-50/60 dark:bg-emerald-500/10'
    : isPending
      ? 'bg-indigo-50/60 dark:bg-indigo-500/10'
      : rowIndex % 2 === 0
        ? 'bg-white dark:bg-slate-900'
        : 'bg-slate-50/40 dark:bg-slate-800/40';

  // La celda sticky debe ser 100 % opaca: las columnas técnicas se desplazan
  // por debajo de ella y cualquier color con transparencia deja ver su texto.
  const actionBg = isThisNodeActive
    ? 'bg-emerald-50 dark:bg-emerald-950'
    : isPending
      ? 'bg-indigo-50 dark:bg-indigo-950'
      : rowIndex % 2 === 0
        ? 'bg-white dark:bg-slate-900'
        : 'bg-slate-50 dark:bg-slate-800';

  const borderLeft = isThisNodeActive
    ? 'border-l-2 border-l-emerald-400'
    : isPending
      ? 'border-l-2 border-l-indigo-400'
      : 'border-l-2 border-l-transparent';

  const handleRepair = async () => {
    await repairFunc(addLog, setLogs, scheduleLogsClear);
  };

  const handleWgPeerClick = () => {
    setShowWgPeerForm(v => !v);
    setShowKebab(false);
  };

  const handleRepairClick = async () => {
    await handleRepair();
    setShowKebab(false);
  };

  const handleOpenSshForm = async () => {
    await openSshForm();
    setShowKebab(false);
  };

  const handleDiagnoseClick = () => {
    onDiagnose?.();
    setShowKebab(false);
  };

  // Cierran el kebab al elegir la acción: si no, el dropdown (portal z-[9999])
  // queda abierto sobre el modal y permite abrir una segunda acción (modales
  // apilados). Antes solo lo hacían repair/ssh/diagnose.
  const handleEditClick = () => { onEdit?.(); setShowKebab(false); };
  const handleScriptClick = () => { onScript?.(); setShowKebab(false); };
  const handleTagClick = () => { onTagClick?.(); setShowKebab(false); };
  const handleHistoryClick = () => { onHistory?.(); setShowKebab(false); };
  const handleDeleteClick = () => { onDelete?.(); setShowKebab(false); };

  if (mobile) {
    const mobileCols = visibleCols ?? ['vrf', 'lan', 'ip_tunnel', 'ppp_user'];
    const detailLabel: Record<string, string> = {
      vrf: 'Ruta asignada', lan: 'Red del sitio', ip_tunnel: 'Dirección de conexión',
      ppp_user: 'Identificador', tags: 'Etiquetas', service: 'Conexión',
      disabled: 'Disponibilidad', uptime: 'Tiempo en línea',
    };
    const detailValue = (key: string) => {
      switch (key) {
        case 'vrf': return node.nombre_vrf || '—';
        case 'lan': return node.lan_subnets?.length ? [...new Set(node.lan_subnets)].join(', ') : node.segmento_lan || '—';
        case 'ip_tunnel': return node.ip_tunnel || '—';
        case 'ppp_user': return node.ppp_user || '—';
        case 'tags': return tags.length ? tags.join(', ') : '—';
        case 'service': return node.service === 'wireguard' ? 'WireGuard' : node.service?.toUpperCase() || '—';
        case 'disabled': return node.disabled ? 'No disponible' : 'Habilitado';
        case 'uptime': return node.uptime || '—';
        default: return '—';
      }
    };

    return (
      <article className={`overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-700 ${rowBg} ${borderLeft}`}>
        <div className="p-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
              ${isThisNodeActive ? 'bg-emerald-600 ring-2 ring-emerald-300' : isPending ? 'bg-indigo-500' : node.running ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
              {isPending
                ? <Loader2 className="h-5 w-5 animate-spin text-white" />
                : <Router className={`h-5 w-5 ${node.running || isThisNodeActive ? 'text-white' : 'text-slate-400'}`} />}
            </div>

            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold leading-5 text-slate-800 dark:text-slate-100">{node.nombre_nodo}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {node.running && !node.disabled ? (
                  <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> En línea
                  </span>
                ) : (
                  <span className={`badge ${node.disabled ? 'badge-danger' : 'badge-warning'}`}>
                    {node.disabled ? 'No disponible' : 'Fuera de línea'}
                  </span>
                )}
                {isThisNodeActive && countdown && <span className="badge badge-warning"><Clock className="h-2.5 w-2.5" />{countdown}</span>}
                {node.active_by_other && !isThisNodeActive && <span className="badge badge-info">{node.active_by_other}</span>}
              </div>
            </div>

            {canManage && (
              <NodeCardKebabMenu
                node={node} showKebab={showKebab} kebabCoords={kebabCoords} kebabRef={kebabRef}
                dropdownRef={dropdownRef} logs={logs} isRepairing={isRepairing} isPending={isPending}
                onHandleKebabClick={handleKebabClick} onToggleWgPeerForm={handleWgPeerClick}
                onHandleRepair={handleRepairClick} onOpenSshForm={handleOpenSshForm} onEdit={handleEditClick}
                onScript={handleScriptClick} onTagClick={handleTagClick} onHistory={handleHistoryClick}
                onDelete={handleDeleteClick} onDiagnose={onDiagnose ? handleDiagnoseClick : undefined}
              />
            )}
          </div>

          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map(tag => <span key={tag} className="rounded-full bg-violet-100 px-2 py-0.5 text-2xs font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{tag}</span>)}
            </div>
          )}

          {mobileCols.length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              {mobileCols.map(key => (
                <div key={key} className="min-w-0 rounded-lg bg-white/80 px-2.5 py-2 dark:bg-slate-900/60">
                  <dt className="truncate text-2xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{detailLabel[key]}</dt>
                  <dd className="mt-0.5 break-words text-xs font-semibold text-slate-700 dark:text-slate-200">{detailValue(key)}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            {!isThisNodeActive ? (
              <button disabled={!canActivate} onClick={handleActivate} title={accessBlockReason ?? undefined}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                  ${canActivate ? 'btn-primary' : 'cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-600'}`}>
                {isActivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isActivating ? 'Conectando...' : 'Conectar al sitio'}
              </button>
            ) : (
              <button disabled={isPending} onClick={handleDeactivate} className="btn-danger flex min-h-11 w-full items-center justify-center gap-2 px-4 text-sm disabled:opacity-50">
                {isDeactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                {isDeactivating ? 'Desconectando...' : 'Desconectar del sitio'}
              </button>
            )}
          </div>
        </div>

        <table className="w-full"><tbody>
          <NodeCardLogsSection showLogs={showLogs} logs={logs} logsEndRef={logsEndRef} rowIndex={rowIndex}
            isPending={isPending} isThisNodeActive={isThisNodeActive} onClose={clearLogs} />
          <NodeCardWgPeerForm showWgPeerForm={showWgPeerForm} rowIndex={rowIndex} isPending={isPending}
            isThisNodeActive={isThisNodeActive} wgPeerKey={wgPeerKey} isSettingPeer={isSettingPeer}
            onSetWgPeerKey={setWgPeerKey} onHandleSetWgPeer={handleSetWgPeer}
            onClosePeerForm={() => { setShowWgPeerForm(false); setWgPeerKey(''); }} />
        </tbody></table>

        <NodeCardSshForm showSshForm={showSshForm} node={node} sshCredsArr={sshCredsArr}
          showPasswords={showPasswords} sshLoading={sshLoading} sshSaved={sshSaved}
          onSetShowPasswords={setShowPasswords} onCloseSshForm={closeSshForm} onUpdateCred={updateCred}
          onRemoveCred={removeCred} onMoveCred={moveCred}
          onAddCred={() => { if (sshCredsArr.length < 5) setSshCredsArr([...sshCredsArr, { user: '', pass: '' }]); }}
          onSaveSshCreds={saveSshCreds} />
      </article>
    );
  }

  return (
    <Fragment>
      {/* ── Fila principal ── */}
      <tr className={`${rowBg} ${borderLeft} transition-colors hover:bg-indigo-50/30 dark:hover:bg-indigo-500/10 group`}>
        <NodeCardStatusIcon node={node} isThisNodeActive={isThisNodeActive} isPending={isPending} />

        <NodeCardNameSection
          node={node}
          editingName={editingName}
          nameInput={nameInput}
          savingName={savingName}
          nameInputRef={nameInputRef}
          countdown={countdown}
          isThisNodeActive={isThisNodeActive}
          tags={tags}
          onSetNameInput={setNameInput}
          onSaveName={saveNodeName}
          onCancelEdit={cancelEditName}
          onStartEdit={startEditName}
          canEditName={canManage}
        />

        <NodeCardStatusRow node={node} visibleCols={visibleCols} tags={tags} />

        {/* Acciones — §44 sticky-right. El fondo es deliberadamente opaco
            para ocultar las columnas que pasan por debajo. El borde y la
            sombra lateral separan visualmente este panel fijo. */}
        <td
          className={`sticky right-0 z-10 border-l border-slate-200 px-4 py-3 shadow-[-8px_0_12px_-10px_rgba(15,23,42,0.45)] dark:border-slate-700 ${actionBg} group-hover:bg-indigo-50 dark:group-hover:bg-slate-800`}
        >
          <div className="flex items-center justify-end gap-2">
            {/* Acceder — tenue en reposo, sólido al hover de la fila */}
            {!isThisNodeActive && (
              <button
                disabled={!canActivate}
                onClick={handleActivate}
                title={accessBlockReason ?? undefined}
                className={`flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                  ${canActivate
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-700 hover:shadow-indigo-500/30 active:scale-[0.97] dark:bg-indigo-500 dark:hover:bg-indigo-400'
                    : 'bg-slate-50 text-slate-300 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'}`}
              >
                {isActivating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Play className="w-3.5 h-3.5" />}
                <span>{isActivating ? 'Conectando...' : 'Conectar'}</span>
              </button>
            )}

            {/* Revocar — solo en el nodo activo */}
            {isThisNodeActive && (
              <button
                disabled={isPending}
                onClick={handleDeactivate}
                className="btn-danger flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {isDeactivating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ShieldOff className="w-3.5 h-3.5" />}
                <span>{isDeactivating ? 'Desconectando...' : 'Desconectar'}</span>
              </button>
            )}

            {/* Separator + kebab — solo si el rol puede gestionar.
                MEMBER solo ve "Acceder" / "Revocar". */}
            {canManage && (
              <>
                <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
                <NodeCardKebabMenu
                  node={node}
                  showKebab={showKebab}
                  kebabCoords={kebabCoords}
                  kebabRef={kebabRef}
                  dropdownRef={dropdownRef}
                  logs={logs}
                  isRepairing={isRepairing}
                  isPending={isPending}
                  onHandleKebabClick={handleKebabClick}
                  onToggleWgPeerForm={handleWgPeerClick}
                  onHandleRepair={handleRepairClick}
                  onOpenSshForm={handleOpenSshForm}
                  onEdit={handleEditClick}
                  onScript={handleScriptClick}
                  onTagClick={handleTagClick}
                  onHistory={handleHistoryClick}
                  onDelete={handleDeleteClick}
                  onDiagnose={onDiagnose ? handleDiagnoseClick : undefined}
                />
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Logs */}
      <NodeCardLogsSection
        showLogs={showLogs}
        logs={logs}
        logsEndRef={logsEndRef}
        rowIndex={rowIndex}
        isPending={isPending}
        isThisNodeActive={isThisNodeActive}
        onClose={clearLogs}
      />

      {/* WireGuard Peer Form */}
      <NodeCardWgPeerForm
        showWgPeerForm={showWgPeerForm}
        rowIndex={rowIndex}
        isPending={isPending}
        isThisNodeActive={isThisNodeActive}
        wgPeerKey={wgPeerKey}
        isSettingPeer={isSettingPeer}
        onSetWgPeerKey={setWgPeerKey}
        onHandleSetWgPeer={handleSetWgPeer}
        onClosePeerForm={() => { setShowWgPeerForm(false); setWgPeerKey(''); }}
      />

      {/* SSH Credentials Form */}
      <NodeCardSshForm
        showSshForm={showSshForm}
        node={node}
        sshCredsArr={sshCredsArr}
        showPasswords={showPasswords}
        sshLoading={sshLoading}
        sshSaved={sshSaved}
        onSetShowPasswords={setShowPasswords}
        onCloseSshForm={closeSshForm}
        onUpdateCred={updateCred}
        onRemoveCred={removeCred}
        onMoveCred={moveCred}
        onAddCred={() => { if (sshCredsArr.length < 5) setSshCredsArr([...sshCredsArr, { user: '', pass: '' }]); }}
        onSaveSshCreds={saveSshCreds}
      />
    </Fragment>
  );
}
