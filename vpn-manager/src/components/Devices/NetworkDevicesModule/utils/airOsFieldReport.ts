import type { AirOsAiAnalysis, AirOsRiskReason } from '@gestionvpn/contracts';
import { RISK_LABELS, type AirOsNetworkReportData, type AirOsNetworkReportDevice } from './airOsAiReport';

export interface AirOsFieldProblem {
  code: string;
  parameter: string;
  status: string;
  value: string;
  diagnosis: string;
  fieldChecks: string[];
}

export interface AirOsDeviceFieldReport {
  device: AirOsNetworkReportDevice;
  title: string;
  problems: AirOsFieldProblem[];
  aiInterpretation: string;
  possibleCauses: string[];
  additionalChecks: string[];
}

const unique = (values: string[], limit = Number.POSITIVE_INFINITY) =>
  [...new Set(values.filter(Boolean))].slice(0, limit);

function joinSpanish(values: string[]) {
  if (values.length <= 1) return values[0] || 'Parámetros del enlace en observación';
  return `${values.slice(0, -1).join(', ')} y ${values.at(-1)}`;
}

function titleLabel(label: string) {
  const lower = label.toLocaleLowerCase('es');
  if (lower.startsWith('ccq')) return `CCQ${lower.slice(3)}`;
  if (lower.startsWith('snr')) return `SNR${lower.slice(3)}`;
  if (lower.startsWith('airmax')) return `airMAX${lower.slice(6)}`;
  return lower;
}

function titleForReasons(reasons: AirOsRiskReason[]) {
  const rateDirections = new Set(reasons
    .filter(reason => reason.code.startsWith('TX_RATE_') || reason.code.startsWith('RX_RATE_'))
    .map(reason => reason.code.slice(0, 2)));
  const labels = reasons
    .filter(reason => !reason.code.startsWith('TX_RATE_') && !reason.code.startsWith('RX_RATE_'))
    .map(reason => titleLabel(reason.label));
  if (rateDirections.size === 2) labels.unshift('tasas TX/RX deficientes');
  else if (rateDirections.has('TX')) labels.unshift('tasa TX deficiente');
  else if (rateDirections.has('RX')) labels.unshift('tasa RX deficiente');
  const title = joinSpanish(unique(labels));
  return title.charAt(0).toLocaleUpperCase('es') + title.slice(1);
}

function parameterFor(code: string) {
  if (code.startsWith('SIGNAL_')) return 'Señal';
  if (code.startsWith('NOISE_')) return 'Ruido';
  if (code.startsWith('CCQ_')) return 'CCQ';
  if (code.startsWith('SNR_')) return 'SNR';
  if (code.startsWith('TX_RATE_')) return 'Tasa TX';
  if (code.startsWith('RX_RATE_')) return 'Tasa RX';
  if (code.startsWith('AIRMAX_QUALITY_')) return 'Calidad airMAX';
  if (code.startsWith('AIRMAX_CAPACITY_')) return 'Capacidad airMAX';
  if (code.startsWith('TX_RETRIES_')) return 'Reintentos TX';
  if (code.startsWith('LATENCY_')) return 'Latencia TX';
  if (code === 'LAN_SPEED_LOW') return 'Enlace LAN';
  return 'Parámetro inalámbrico';
}

function guidance(reason: AirOsRiskReason, device: AirOsNetworkReportDevice) {
  const code = reason.code;
  if (code.startsWith('SIGNAL_')) return {
    diagnosis: 'El nivel recibido está fuera del rango objetivo y puede reducir la estabilidad o la modulación del enlace.',
    checks: ['Revisar alineación fina de ambas antenas', 'Confirmar línea de vista y despeje de la zona de Fresnel', 'Verificar potencia y polarización en ambos extremos'],
  };
  if (code.startsWith('TX_RATE_') || code.startsWith('RX_RATE_')) {
    const channelWidth = device.channelWidth ?? 20;
    const expected = channelWidth >= 40 ? 150 : 72;
    return {
      diagnosis: `La tasa negociada está muy por debajo de la referencia aproximada de ${expected} Mbps para ${channelWidth} MHz; puede existir desalineación, interferencia o una modulación degradada.`,
      checks: ['Verificar alineación y cadenas de antena', 'Revisar espectro, frecuencia y ruido del canal', 'Comprobar ancho de canal, MCS y negociación airMAX'],
    };
  }
  if (code.startsWith('CCQ_')) return {
    diagnosis: 'La eficiencia de transmisión indica pérdidas o reintentos; una señal fuerte por sí sola no garantiza un enlace limpio.',
    checks: ['Revisar interferencia y ocupación del canal', 'Comprobar alineación y polarización', 'Validar reintentos TX y estabilidad del CCQ'],
  };
  if (code.startsWith('SNR_')) return {
    diagnosis: 'El margen entre señal y ruido es reducido, por lo que el enlace tiene menos tolerancia ante interferencias y variaciones.',
    checks: ['Medir el piso de ruido durante varios minutos', 'Buscar un canal con mejor margen', 'Revisar Fresnel y orientación de antenas'],
  };
  if (code.startsWith('NOISE_')) return {
    diagnosis: 'El piso de ruido está elevado y puede forzar retransmisiones o modulaciones más bajas.',
    checks: ['Ejecutar un análisis de espectro', 'Comparar canales y frecuencias alternativas', 'Identificar fuentes de interferencia cercanas'],
  };
  if (code.startsWith('AIRMAX_QUALITY_') || code.startsWith('AIRMAX_CAPACITY_')) return {
    diagnosis: 'El indicador airMAX muestra eficiencia o capacidad reducida aun cuando otros valores puedan parecer normales.',
    checks: ['Revisar calidad/capacidad airMAX en ambos extremos', 'Comprobar carga y configuración del AP', 'Validar sincronización, prioridad y airtime'],
  };
  if (code.startsWith('TX_RETRIES_')) return {
    diagnosis: 'La cantidad de reintentos confirma pérdidas en el medio inalámbrico y consumo adicional de airtime.',
    checks: ['Revisar interferencia y CCQ', 'Comprobar alineación y cadenas', 'Observar reintentos durante una prueba de tráfico'],
  };
  if (code.startsWith('LATENCY_')) return {
    diagnosis: 'La latencia de transmisión es elevada y puede reflejar congestión, reintentos o saturación del enlace.',
    checks: ['Medir latencia con y sin tráfico', 'Revisar airtime y carga del AP', 'Correlacionar con CCQ y reintentos TX'],
  };
  if (code === 'LAN_SPEED_LOW') return {
    diagnosis: 'La negociación Ethernet puede limitar el rendimiento aunque el tramo inalámbrico funcione correctamente.',
    checks: ['Revisar cable UTP, conectores y PoE', 'Confirmar velocidad y dúplex Ethernet', 'Probar con cable y puerto conocidos como buenos'],
  };
  return {
    diagnosis: 'El parámetro está fuera del rango esperado y requiere verificación en campo.',
    checks: ['Confirmar el valor en ambos extremos', 'Repetir la medición bajo tráfico controlado'],
  };
}

function mergeFindings(findings: AirOsAiAnalysis['findings'], alias: string) {
  const matches = findings.filter(finding => finding.deviceIds.includes(alias));
  return {
    interpretation: unique(matches.map(finding => finding.interpretation)).join(' '),
    causes: unique(matches.flatMap(finding => finding.possibleCauses), 5),
    checks: unique(matches.flatMap(finding => finding.manualChecks), 6),
  };
}

export function buildAirOsDeviceFieldReports(report: AirOsNetworkReportData): AirOsDeviceFieldReport[] {
  return report.devices.map(device => {
    const ai = mergeFindings(report.analysis.findings, device.alias);
    return {
      device,
      title: titleForReasons(device.reasons),
      problems: device.reasons.map(reason => {
        const advice = guidance(reason, device);
        return {
          code: reason.code,
          parameter: parameterFor(reason.code),
          status: RISK_LABELS[reason.level],
          value: `${reason.value} ${reason.unit}`,
          diagnosis: advice.diagnosis,
          fieldChecks: advice.checks,
        };
      }),
      aiInterpretation: ai.interpretation || 'Gemini no agregó una interpretación adicional para este equipo.',
      possibleCauses: ai.causes,
      additionalChecks: ai.checks,
    };
  });
}
