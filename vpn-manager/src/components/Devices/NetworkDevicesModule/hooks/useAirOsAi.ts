import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AirOsAiAnalysisResult, AirOsAiStatus } from '@gestionvpn/contracts';
import type { ScannedDevice } from '../../../../types/devices';
import type { ApiError } from '../../../../services/sessionClient';
import { airOsAiApi, toAirOsAiDevice } from '../../../../services/airOsAiApi';

interface NetworkScope {
  subnet?: string;
  roleFilter?: 'ap' | 'sta' | 'unknown';
  ssidFilter?: string;
  searchApplied?: boolean;
  visibleCount: number;
}

type PendingAnalysis =
  | { kind: 'DEVICE'; devices: ScannedDevice[]; visibleCount: 1 }
  | { kind: 'NETWORK'; devices: ScannedDevice[]; scope: NetworkScope };

export function useAirOsAi(isModerator: boolean) {
  const [status, setStatus] = useState<AirOsAiStatus | null>(null);
  const [pending, setPending] = useState<PendingAnalysis | null>(null);
  const [result, setResult] = useState<AirOsAiAnalysisResult | null>(null);
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
    setPending({ kind: 'DEVICE', devices: [device], visibleCount: 1 });
  }, [available]);

  const requestNetwork = useCallback((devices: ScannedDevice[], scope: NetworkScope) => {
    const withStats = devices.filter(device => !!device.cachedStats);
    if (!available || withStats.length === 0) return;
    setError(null);
    setResult(null);
    setPending({ kind: 'NETWORK', devices: withStats, scope });
  }, [available]);

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
            devices: pending.devices.map(toAirOsAiDevice),
          });
      setResult(response.result);
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
    setError(null);
  }, [busy]);

  return useMemo(() => ({
    available, status, pending, result, busy, error,
    requestDevice, requestNetwork, submit, close,
  }), [available, status, pending, result, busy, error, requestDevice, requestNetwork, submit, close]);
}

export type AirOsAiController = ReturnType<typeof useAirOsAi>;
