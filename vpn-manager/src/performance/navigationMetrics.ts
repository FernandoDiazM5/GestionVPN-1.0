import type { ModuleId } from '../utils/permissions';

const START_PREFIX = 'navigation-click:';
const VISIBLE_PREFIX = 'module-visible:';
const MEASURE_PREFIX = 'navigation-visible:';

function supportsPerformanceMarks(): boolean {
  return typeof performance !== 'undefined'
    && typeof performance.mark === 'function'
    && typeof performance.measure === 'function';
}

export function markNavigationStart(moduleId: ModuleId): void {
  if (!supportsPerformanceMarks()) return;
  const startName = `${START_PREFIX}${moduleId}`;
  performance.clearMarks(startName);
  performance.clearMeasures(`${MEASURE_PREFIX}${moduleId}`);
  performance.mark(startName);
}

export function markModuleVisible(moduleId: ModuleId): void {
  if (!supportsPerformanceMarks()) return;
  const startName = `${START_PREFIX}${moduleId}`;
  if (performance.getEntriesByName(startName, 'mark').length === 0) return;

  const visibleName = `${VISIBLE_PREFIX}${moduleId}`;
  const measureName = `${MEASURE_PREFIX}${moduleId}`;
  performance.clearMarks(visibleName);
  performance.mark(visibleName);
  performance.measure(measureName, startName, visibleName);
  performance.clearMarks(startName);
  performance.clearMarks(visibleName);
}

