// ============================================================
//  dashboardApi — métricas en vivo del backend (Q2)
// ============================================================
import { get } from './sessionClient';
import type { DashboardMetricsResponse } from '@gestionvpn/contracts';

export const dashboardApi = {
  metrics: () => get<DashboardMetricsResponse>('/api/dashboard/metrics'),
};
