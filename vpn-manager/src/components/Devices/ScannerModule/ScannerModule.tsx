import { useState } from 'react';
import { useVpn } from '../../context/VpnContext';
import { useSecretScanning, useSecretManagement } from './hooks';
import { filterSecrets, calculateTotalPages, getPaginatedSecrets } from './utils';
import { ScannerHeader, ScannerError, SecretsTable, EmptyState } from './components';

export default function ScannerModule() {
  const {
    credentials,
    managedVpns, setManagedVpns,
    scannedSecrets, setScannedSecrets,
    hasScanned, setHasScanned,
  } = useVpn();

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const { isScanning, errorMsg, handleScan } = useSecretScanning();
  const { isManaged, handleToggleManage } = useSecretManagement(managedVpns, setManagedVpns);

  const handleScanClick = async () => {
    const secrets = await handleScan(credentials);
    if (secrets !== null) {
      setScannedSecrets(secrets);
      setHasScanned(true);
      setPage(1);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const filteredSecrets = filterSecrets(scannedSecrets, searchTerm);
  const totalPages = calculateTotalPages(filteredSecrets.length);
  const pagedSecrets = getPaginatedSecrets(filteredSecrets, page);

  return (
    <div className="space-y-5">
      <ScannerHeader isScanning={isScanning} onScan={handleScanClick} />

      {errorMsg && <ScannerError message={errorMsg} />}

      {hasScanned && (
        <SecretsTable
          secrets={scannedSecrets}
          searchTerm={searchTerm}
          onSearchChange={handleSearch}
          page={page}
          onPageChange={setPage}
          filteredSecrets={filteredSecrets}
          pagedSecrets={pagedSecrets}
          totalPages={totalPages}
          managedVpns={managedVpns}
          isManaged={isManaged}
          onToggleManage={handleToggleManage}
        />
      )}

      {!hasScanned && !isScanning && <EmptyState />}
    </div>
  );
}
