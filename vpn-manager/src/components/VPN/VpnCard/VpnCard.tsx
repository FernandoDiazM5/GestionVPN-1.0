import { useState } from 'react';
import { useVpn } from '../../../context';
import { useVpnStatus, useVpnLogs, useVpnUptime } from './hooks';
import { VpnCardRow } from './components';
import ConfirmModal from '../../Common/ConfirmModal';
import type { VpnCardProps } from './types';

export default function VpnCard({ vpn, rowIndex, onUpdate, onRemove }: VpnCardProps) {
  const { credentials } = useVpn();
  const [showConfirm, setShowConfirm] = useState(false);

  const { status, handleActivate, handleDeactivate } = useVpnStatus(vpn.running || false);
  const { logs, addLog, logsEndRef } = useVpnLogs(vpn);
  const { uptime } = useVpnUptime(vpn, status);

  const handleActivateClick = async () => {
    await handleActivate(credentials, vpn, addLog, onUpdate);
  };

  const handleDeactivateClick = async () => {
    await handleDeactivate(credentials, vpn, addLog, onUpdate);
  };

  const handleRemoveClick = () => {
    setShowConfirm(false);
    onRemove();
  };

  return (
    <>
      <ConfirmModal
        isOpen={showConfirm}
        title="Quitar de gestión"
        message={`¿Quitar "${vpn.name}" del panel? No afecta la configuración del router.`}
        confirmLabel="Quitar"
        onConfirm={handleRemoveClick}
        onCancel={() => setShowConfirm(false)}
      />

      <VpnCardRow
        vpn={vpn}
        rowIndex={rowIndex}
        status={status}
        logs={logs}
        uptime={uptime}
        logsEndRef={logsEndRef}
        onActivate={handleActivateClick}
        onDeactivate={handleDeactivateClick}
        onRemove={() => setShowConfirm(true)}
      />
    </>
  );
}
