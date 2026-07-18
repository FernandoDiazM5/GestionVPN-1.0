import type { AirOsNetworkReportData } from './airOsAiReport';
import { buildAirOsDeviceFieldReports } from './airOsFieldReport';

function whatsappList(items: string[]) {
  return items.map(item => `• ${item}`);
}

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
    lines.push(`*${index + 1}. ANÁLISIS POR CLIENTE*`);
    lines.push(`*${device.name}*`);
    lines.push(`📍 *IP:* ${device.ip}`);
    lines.push(`📡 *AP asociado:* ${device.apName}`);
    lines.push('');
    lines.push('*📋 RESUMEN DEL ESTADO*');
    lines.push(deviceReport.aiInterpretation);
    lines.push(`⚠️ *Problemas observados:* ${deviceReport.title}`);
    lines.push('');
    lines.push('*📊 MÉTRICAS CLAVE*');
    lines.push(`TX: *${device.txRate ?? 'N/D'} Mbps* | RX: *${device.rxRate ?? 'N/D'} Mbps*`);
    lines.push(`Señal: *${device.signal ?? 'N/D'} dBm* | SNR: *${device.snr ?? 'N/D'} dB* | CCQ: *${device.ccq ?? 'N/D'}%*`);
    lines.push('');
    lines.push('*🔎 PROBLEMA PRINCIPAL*');
    lines.push(deviceReport.problems.map(problem => `${problem.parameter} (${problem.status}, ${problem.value}): ${problem.diagnosis}`).join(' '));
    if (deviceReport.possibleCauses.length > 0) {
      lines.push('');
      lines.push('*🧩 POSIBLES CAUSAS*');
      lines.push(...whatsappList(deviceReport.possibleCauses));
    }
    lines.push('');
    lines.push('*🖥️ PLAN DE ACCIÓN: REVISIONES REMOTAS*');
    lines.push(...whatsappList(deviceReport.remoteChecks.length ? deviceReport.remoteChecks : ['Sin comprobaciones remotas adicionales.']));
    lines.push('');
    lines.push('*🛠️ PLAN DE ACCIÓN: REVISIONES EN CAMPO*');
    lines.push(...whatsappList(deviceReport.fieldChecks.length ? deviceReport.fieldChecks : ['Sin comprobaciones de campo adicionales.']));
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
