import type { WebObservation, WebObservationSource } from '../../../services/securityAdminApi';

const bareIp = (target: string) => target.replace(/\/(?:32|128)$/, '');

export function isCurrentObservationSource(source: WebObservationSource) {
  return source.authFailures24h > 0 || source.rateLimited10m > 0
    || source.notFound5m > 0 || source.sensitive10m > 0
    || source.recommendations.length > 0;
}

export function protectionStatusLabel(enforcement: WebObservation['enforcement']) {
  if (!enforcement.active) {
    return enforcement.armed ? 'Protección preparada · 0%' : 'Protección desactivada';
  }
  return enforcement.rolloutPercent === 100 ? 'Protección automática activa'
    : `Protección gradual · ${enforcement.rolloutPercent}%`;
}

export function managedTrustedTargets(trusted: string[], systemTrusted: string[]) {
  const systemIps = new Set(systemTrusted.map(bareIp));
  return trusted.filter((target) => !systemIps.has(bareIp(target)));
}

export function systemTrustedIpSet(systemTrusted: string[]) {
  return new Set(systemTrusted.map(bareIp));
}
