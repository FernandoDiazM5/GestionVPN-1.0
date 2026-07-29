import { useEffect } from 'react';
import type { ModuleId } from '../utils/permissions';
import { markModuleVisible } from './navigationMetrics';

export default function ModuleRenderMetric({ moduleId }: { moduleId: ModuleId }) {
  useEffect(() => {
    markModuleVisible(moduleId);
  }, [moduleId]);

  return null;
}

