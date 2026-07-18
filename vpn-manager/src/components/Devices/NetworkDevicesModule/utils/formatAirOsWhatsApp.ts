import type { AirOsNetworkReportData } from './airOsAiReport';
import { buildAirOsDeviceFieldReports } from './airOsFieldReport';

export function formatAirOsNetworkWhatsApp(report: AirOsNetworkReportData): string {
  const deviceReports = buildAirOsDeviceFieldReports(report);
  const lines = [
    '*📡 DIAGNÓSTICO CONSULTIVO AirOS*',
    `📊 Equipos analizados: *${report.summary.selected}*`,
    `🕒 ${new Date(report.snapshotAt).toLocaleString('es-PE')}`,
    '',
  ];

  deviceReports.forEach((deviceReport, index) => {
    const { device } = deviceReport;
    lines.push(`*${index + 1}. ${device.name}*`);
    lines.push(`📍 IP: ${device.ip}`);
    lines.push(`📡 AP: ${device.apName}`);
    lines.push(`⚠️ *Problemas:* ${deviceReport.title}`);
    lines.push(`📶 Señal/SNR/CCQ: ${device.signal ?? 'N/D'} dBm · ${device.snr ?? 'N/D'} dB · ${device.ccq ?? 'N/D'}%`);
    lines.push(`🚀 TX/RX: ${device.txRate ?? 'N/D'} / ${device.rxRate ?? 'N/D'} Mbps`);
    lines.push('');

    deviceReport.problems.forEach(problem => {
      lines.push(`*🔎 ${problem.parameter}: ${problem.status} (${problem.value})*`);
      lines.push(`🩺 *Diagnóstico:* ${problem.diagnosis}`);
      lines.push(`🔧 *Acciones de campo:* ${problem.fieldChecks.join('; ')}`);
      lines.push('');
    });

    lines.push(`🤖 *Diagnóstico general:* ${deviceReport.aiInterpretation}`);
    if (deviceReport.possibleCauses.length > 0) lines.push(`🧩 *Posibles causas:* ${deviceReport.possibleCauses.join('; ')}`);
    if (deviceReport.additionalChecks.length > 0) lines.push(`✅ *Comprobaciones adicionales:* ${deviceReport.additionalChecks.join('; ')}`);
    lines.push('', '────────────────────', '');
  });

  lines.push('ℹ️ Informe consultivo. Verificar los valores en ambos extremos antes de realizar cambios.');
  return lines.join('\n').trim();
}

export async function copyAirOsNetworkWhatsApp(report: AirOsNetworkReportData): Promise<void> {
  const text = formatAirOsNetworkWhatsApp(report);
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}
