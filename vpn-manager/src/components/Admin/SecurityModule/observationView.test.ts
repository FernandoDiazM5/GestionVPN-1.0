import { describe, expect, it } from 'vitest';
import type { WebObservationSource } from '../../../services/securityAdminApi';
import {
  isCurrentObservationSource, managedTrustedTargets, protectionStatusLabel,
} from './observationView';

const source = (overrides: Partial<WebObservationSource> = {}): WebObservationSource => ({
  sourceIp: '198.51.100.7', authFailures24h: 0, identities24h: 0,
  unknownIdentities24h: 0, rateLimited10m: 0, notFound5m: 0,
  distinctRoutes5m: 0, sensitive10m: 0, firstSeen: 1, lastSeen: 2,
  events: 1, recommendations: [], ...overrides,
});

describe('presentación de actividad web', () => {
  it('separa filas históricas sin contadores de la actividad vigente', () => {
    expect(isCurrentObservationSource(source())).toBe(false);
    expect(isCurrentObservationSource(source({ notFound5m: 1 }))).toBe(true);
    expect(isCurrentObservationSource(source({ recommendations: ['ROUTE_SCAN_DETECTED'] }))).toBe(true);
  });

  it('nombra el despliegue total sin terminología canary', () => {
    expect(protectionStatusLabel({ active: true, armed: true, rolloutPercent: 100 } as never))
      .toBe('Protección automática activa');
    expect(protectionStatusLabel({ active: true, armed: true, rolloutPercent: 25 } as never))
      .toBe('Protección gradual · 25%');
  });

  it('no muestra una IP del sistema como excepción removible', () => {
    expect(managedTrustedTargets(
      ['134.199.212.232/32', '179.6.169.75/32', '213.173.36.232/32'],
      ['134.199.212.232/32', '213.173.36.232/32'],
    )).toEqual(['179.6.169.75/32']);
  });
});
