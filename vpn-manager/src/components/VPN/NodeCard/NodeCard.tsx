import { Fragment } from 'react';
import { Play, ShieldOff, Loader2 } from 'lucide-react';
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
    setShowSshForm,
    sshCredsArr,
    setSshCredsArr,
    sshLoading,
    sshSaved,
    showPasswords,
    setShowPasswords,
    openSshForm,
    saveSshCreds,
    updateCred,
    removeCred,
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
    ? 'Sin VRF asignado'
    : node.disabled
      ? 'Secret PPP deshabilitado'
      : !node.running
        ? 'Torre no conectada al VPN'
        : null;

  const rowBg = isThisNodeActive
    ? 'bg-emerald-50/60 dark:bg-emerald-500/10'
    : isPending
      ? 'bg-indigo-50/60 dark:bg-indigo-500/10'
      : rowIndex % 2 === 0
        ? 'bg-white dark:bg-slate-900'
        : 'bg-slate-50/40 dark:bg-slate-800/40';

  const borderLeft = isThisNodeActive
    ? 'border-l-2 border-l-emerald-400'
    : isPending
      ? 'border-l-2 border-l-indigo-400'
      : 'border-l-2 border-l-transparent';

  const handleRepair = async () => {
    await repairFunc(addLog, setLogs);
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

        {/* Acciones — §44 sticky-right. Lleva su propio bg (mismo rowBg
            que la fila) para tapar las celdas que pasan por debajo cuando
            la tabla scrollea horizontalmente. group-hover sincroniza el
            cambio de fondo con el resto del row. Shadow sutil hacia la
            izquierda marca el "flotamiento" cuando hay overflow. */}
        <td
          className={`px-4 py-3 sticky right-0 z-[1] shadow-[-2px_0_6px_-3px_rgba(0,0,0,0.06)] ${rowBg} group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-500/10`}
        >
          <div className="flex items-center justify-end gap-2">
            {/* Acceder — tenue en reposo, sólido al hover de la fila */}
            {!isThisNodeActive && (
              <button
                disabled={!canActivate}
                onClick={handleActivate}
                title={accessBlockReason ?? undefined}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${canActivate
                    ? 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white group-hover:shadow-sm active:scale-[0.97] dark:bg-indigo-500/15 dark:text-indigo-300 dark:group-hover:bg-indigo-500 dark:group-hover:text-white'
                    : 'bg-slate-50 text-slate-300 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'}`}
              >
                {isActivating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Play className="w-3.5 h-3.5" />}
                <span>{isActivating ? 'Abriendo...' : 'Acceder'}</span>
              </button>
            )}

            {/* Revocar — solo en el nodo activo */}
            {isThisNodeActive && (
              <button
                disabled={isPending}
                onClick={handleDeactivate}
                className="btn-danger flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {isDeactivating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ShieldOff className="w-3.5 h-3.5" />}
                <span>{isDeactivating ? 'Revocando...' : 'Revocar'}</span>
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
        rowIndex={rowIndex}
        isPending={isPending}
        isThisNodeActive={isThisNodeActive}
        sshCredsArr={sshCredsArr}
        showPasswords={showPasswords}
        sshLoading={sshLoading}
        sshSaved={sshSaved}
        onSetShowPasswords={setShowPasswords}
        onCloseSshForm={() => setShowSshForm(false)}
        onUpdateCred={updateCred}
        onRemoveCred={removeCred}
        onAddCred={() => { if (sshCredsArr.length < 5) setSshCredsArr([...sshCredsArr, { user: '', pass: '' }]); }}
        onSaveSshCreds={saveSshCreds}
      />
    </Fragment>
  );
}
