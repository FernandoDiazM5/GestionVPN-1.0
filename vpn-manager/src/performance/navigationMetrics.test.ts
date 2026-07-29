import { beforeEach, describe, expect, it } from 'vitest';
import { markModuleVisible, markNavigationStart } from './navigationMetrics';

describe('navigationMetrics', () => {
  beforeEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  it('mide desde el clic hasta que el módulo queda visible', () => {
    markNavigationStart('devices');
    markModuleVisible('devices');

    expect(performance.getEntriesByName('navigation-visible:devices', 'measure')).toHaveLength(1);
    expect(performance.getEntriesByName('navigation-click:devices', 'mark')).toHaveLength(0);
  });

  it('no crea mediciones para navegaciones sin marca de inicio', () => {
    markModuleVisible('monitor');
    expect(performance.getEntriesByName('navigation-visible:monitor', 'measure')).toHaveLength(0);
  });
});

