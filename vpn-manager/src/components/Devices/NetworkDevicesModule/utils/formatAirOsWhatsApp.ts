import type { AirOsNetworkReportData } from './airOsAiReport';

export function formatAirOsNetworkWhatsApp(report: AirOsNetworkReportData): string {
  const lines = [
    '*📡 Diagnóstico consultivo AirOS*',
    `📊 Equipos analizados: *${report.summary.selected}*`,
    `🕒 ${new Date(report.snapshotAt).toLocaleString('es-PE')}`,
    '',
  ];
  report.devices.forEach((device, index) => {
    lines.push(`*${index + 1}. ${device.name}*`);
    lines.push(`📍 IP: ${device.ip} · AP: ${device.apName}`);
    lines.push(`📶 Señal: ${device.signal ?? 'N/D'} dBm · CCQ: ${device.ccq ?? 'N/D'}%`);
    lines.push(`🚀 TX/RX: ${device.txRate ?? 'N/D'} / ${device.rxRate ?? 'N/D'} Mbps`);
    if (device.reasons.length > 0) device.reasons.forEach(reason => lines.push(`⚠️ *${reason.label}:* ${reason.value} ${reason.unit}`));
    else lines.push('✅ Sin parámetros locales adicionales observados');
    lines.push('');
  });
  lines.push('*Recomendaciones de Gemini*');
  report.analysis.findings.forEach(finding => {
    const device = report.devices.find(item => item.alias === finding.deviceIds[0]);
    lines.push(`🔎 *${device?.name || finding.deviceIds[0]} — ${finding.title}*`);
    lines.push(finding.interpretation);
    if (finding.manualChecks.length > 0) lines.push(`🔧 ${finding.manualChecks.join(' · ')}`);
    lines.push('');
  });
  lines.push('ℹ️ Informe consultivo; verificar antes de ejecutar cambios.');
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
