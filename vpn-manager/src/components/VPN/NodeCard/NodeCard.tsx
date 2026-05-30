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
  } = useLogsAndRepair(node, isThisNodeActive);

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
    ? 'bg-emerald-50/60'
    : isPending
      ? 'bg-indigo-50/60'
      : rowIndex % 2 === 0
        ? 'bg-white'
        : 'bg-slate-50/40';

  const borderLeft = isThisNodeActive
    ? 'border-l-2 border-l-emerald-400'
    : isPending
      ? 'border-l-2 border-l-indigo-400'
      : 'border-l-2 border-l-transparent';

  const handleRepair = async () => {
    await repairFunc(addLog, setLogs, null);
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

  return (
    <Fragment>
      {/* ── Fila principal ── */}
      <tr className={`${rowBg} ${borderLeft} transition-colors hover:bg-indigo-50/30 group`}>
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
        />

        <NodeCardStatusRow node={node} />

        {/* Acciones */}
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            {/* Acceder */}
            <button
              disabled={!canActivate || isThisNodeActive}
              onClick={handleActivate}
              title={accessBlockReason ?? undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                ${canActivate && !isThisNodeActive
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/25 active:scale-[0.97]'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
              {isActivating
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />}
              <span>{isActivating ? 'Abriendo...' : 'Acceder'}</span>
            </button>

            {/* Revocar */}
            <button
              disabled={!isThisNodeActive || isPending}
              onClick={handleDeactivate}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                ${isThisNodeActive && !isPending
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-sm shadow-rose-500/25 active:scale-[0.97]'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
            >
              {isDeactivating
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ShieldOff className="w-3.5 h-3.5" />}
              <span>{isDeactivating ? 'Revocando...' : 'Revocar'}</span>
            </button>

            {/* Separator */}
            <div className="w-px h-5 bg-slate-200" />

            {/* Kebab menu */}
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
              onEdit={onEdit}
              onScript={onScript}
              onTagClick={onTagClick}
              onHistory={onHistory}
              onDelete={onDelete}
            />
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
