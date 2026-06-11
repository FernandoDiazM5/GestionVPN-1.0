// ============================================================
//  diagnosticsApi — ping/traceroute desde el router (Q3)
// ============================================================
import { post } from './sessionClient';
import type {
  DiagnosticsPingRequest,
  DiagnosticsPingResponse,
  DiagnosticsTraceRequest,
  DiagnosticsTraceResponse,
} from '@gestionvpn/contracts';

export const diagnosticsApi = {
  ping: (req: DiagnosticsPingRequest) =>
    post<DiagnosticsPingResponse>('/api/diagnostics/ping', req),

  traceroute: (req: DiagnosticsTraceRequest) =>
    post<DiagnosticsTraceResponse>('/api/diagnostics/traceroute', req),
};
