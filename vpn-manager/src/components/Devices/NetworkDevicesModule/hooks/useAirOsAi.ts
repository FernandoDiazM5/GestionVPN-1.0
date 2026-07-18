import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AirOsAiAnalysisResult, AirOsAiNetworkSelection, AirOsAiStatus, AirOsNetworkScoreResult } from '@gestionvpn/contracts';
import type { ScannedDevice } from '../../../../types/devices';
import type { ApiError } from '../../../../services/sessionClient';
import {
  airOsAiApi,
  buildAirOsNetworkPreview,
  toAirOsAiDevice,
  toAirOsAiNetworkDevice,
} from '../../../../services/airOsAiApi';

interface NetworkScope {
  subnet?: string;
  roleFilter?: 'ap' | 'sta' | 'unknown';
  ssidFilter?: string;
  searchApplied?: boolean;
  visibleCount: number;
}

type PendingAnalysis =
  | { kind: 'DEVICE'; devices: ScannedDevice[]; visibleCount: 1 }
  | {
      kind: 'NETWORK';
      devices: ScannedDevice[];
      scope: NetworkScope;
      preview: AirOsNetworkScoreResult;
      selectedIndexes: number[];
    };

export interface AirOsNetworkReportContext {
  devices: ScannedDevice[];
  selection: AirOsAiNetworkSelection;
  snapshotAt: number;
  scope: NetworkScope;
}

export function useAirOsAi(isModerator: boolean) {
  const [status, setStatus] = useState<AirOsAiStatus | null>(null);
  const [pending, setPending] = useState<PendingAnalysis | null>(null);
  const [result, setResult] = useState<AirOsAiAnalysisResult | null>(null);
  const [networkReport, setNetworkReport] = useState<AirOsNetworkReportContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isModerator) return;
    let active = true;
    airOsAiApi.status()
      .then(response => { if (active) setStatus(response.status); })
      .catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, [isModerator]);

  const available = !!(
    isModerator && status?.moderatorAccessEnabled && status.enabled && status.configured
  );

  const requestDevice = useCallback((device: ScannedDevice) => {
    if (!available || !device.cachedStats) return;
    setError(null);
    setResult(null);
    setNetworkReport(null);
    setPending({ kind: 'DEVICE', devices: [device], visibleCount: 1 });
  }, [available]);

  const requestNetwork = useCallback((devices: ScannedDevice[], scope: NetworkScope) => {
    const withStats = devices.filter(device => !!device.cachedStats);
    if (!available || withStats.length === 0) return;
    const preview = buildAirOsNetworkPreview(withStats);
    setError(null);
    setResult(null);
    setNetworkReport(null);
    setPending({ kind: 'NETWORK', devices: withStats, scope, preview, selectedIndexes: preview.selectedIndexes });
  }, [available]);

  const toggleNetworkDevice = useCallback((index: number) => {
    setPending(current => {
      if (!current || current.kind !== 'NETWORK') return current;
      const selected = new Set(current.selectedIndexes);
      if (selected.has(index)) selected.delete(index);
      else if (selected.size < 10 && current.preview.rows.some(row => row.index === index && row.candidate)) selected.add(index);
      return { ...current, selectedIndexes: [...selected] };
    });
  }, []);

  const submit = useCallback(async () => {
    if (!pending || !status || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!status.consentAccepted) {
        await airOsAiApi.consent(status.policyVersion, true);
        setStatus(previous => previous ? { ...previous, consentAccepted: true } : previous);
      }
      const snapshotAt = Date.now();
      const response = pending.kind === 'DEVICE'
        ? await airOsAiApi.analyzeDevice({
            snapshotAt,
            device: toAirOsAiDevice(pending.devices[0]),
          })
        : await airOsAiApi.analyzeNetwork({
            snapshotAt,
            scope: {
              subnet: pending.scope.subnet,
              roleFilter: pending.scope.roleFilter,
              ssidFilter: pending.scope.ssidFilter,
              searchApplied: pending.scope.searchApplied,
            },
            devices: pending.devices.map(toAirOsAiNetworkDevice),
            selectedDeviceIndexes: pending.selectedIndexes,
          });
      setResult(response.result);
      if (pending.kind === 'NETWORK' && response.result.networkSelection) {
        setNetworkReport({
          devices: pending.devices,
          selection: response.result.networkSelection,
          snapshotAt,
          scope: pending.scope,
        });
      }
      setPending(null);
      setStatus(previous => previous ? {
        ...previous,
        usage: {
          requestCount: previous.usage.requestCount + (response.result.cached ? 0 : 1),
          totalTokens: previous.usage.totalTokens + response.result.usage.totalTokens,
        },
      } : previous);
    } catch (cause) {
      const apiError = cause as ApiError;
      setError(apiError.message || 'No fue posible completar el análisis');
    } finally {
      setBusy(false);
    }
  }, [busy, pending, status]);

  const close = useCallback(() => {
    if (busy) return;
    setPending(null);
    setResult(null);
    setNetworkReport(null);
    setError(null);
  }, [busy]);

  return useMemo(() => ({
    available, status, pending, result, networkReport, busy, error,
    requestDevice, requestNetwork, toggleNetworkDevice, submit, close,
  }), [available, status, pending, result, networkReport, busy, error, requestDevice, requestNetwork, toggleNetworkDevice, submit, close]);
}

export type AirOsAiController = ReturnType<typeof useAirOsAi>;
