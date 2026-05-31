import { Wifi } from 'lucide-react';
import type { AntennaStats } from '../../../../types/devices';
import M5Row from './M5Row';
import M5Section from './M5Section';
import { formatDBm, formatMHz, formatPercent, formatMbps, formatBool, formatMs } from '../utils/formatters';
import { SECTION_TITLES } from '../constants';

interface WirelessSectionProps {
  s: AntennaStats;
  family?: 'ac' | 'm5' | 'unknown';
}

export default function WirelessSection({ s, family }: WirelessSectionProps) {
  return (
    <M5Section
      title={SECTION_TITLES.WIRELESS}
      icon={<Wifi className="w-3.5 h-3.5" />}
      colorClass="bg-sky-50 border-sky-200 text-sky-700"
    >
      <M5Row label="mode" value={s.mode} />
      <M5Row label="essid" value={s.essid} />
      <M5Row label="hide_essid" value={s.hideSsid != null ? formatBool(s.hideSsid, 'Oculto', 'Visible') : null} />
      <M5Row label="security" value={s.security} />
      <M5Row label="countrycode" value={s.countryCode} />
      <M5Row label="wlan mac" value={s.wlanMac} />
      <M5Row label="apmac" value={s.apMac} />
      <M5Row label="signal" value={s.signal != null ? formatDBm(s.signal) : null} />
      <M5Row label="rssi" value={s.rssi != null ? formatDBm(s.rssi) : null} />
      <M5Row label="noisefloor" value={s.noiseFloor != null ? formatDBm(s.noiseFloor) : null} />
      <M5Row label="txpower" value={s.txPower != null ? formatDBm(s.txPower) : null} />
      <M5Row label="antenna_gain" value={s.antennaGain != null ? `${s.antennaGain} dBi` : null} />
      <M5Row label="antenna" value={s.antenna} />
      <M5Row label="distance" value={s.distance != null ? `${s.distance} m` : null} />
      <M5Row label="ccq" value={s.ccq != null ? formatPercent(s.ccq) : null} />
      {s.chainRssi && s.chainRssi.length > 0 && (
        <M5Row label="chainrssi" value={s.chainRssi.map((v, i) => `Ch${i}: ${v} dBm`).join(' | ')} />
      )}
      <M5Row label="frequency" value={s.frequency != null ? formatMHz(s.frequency) : null} />
      <M5Row label="channel" value={s.channelNumber != null ? String(s.channelNumber) : null} />
      <M5Row label="chanbw" value={s.channelWidth != null ? formatMHz(s.channelWidth) : null} />
      <M5Row label="chanbw_ext" value={s.channelWidthExt} />
      <M5Row label="freq_range" value={s.freqRange} />
      <M5Row label="opmode" value={s.opmode} />
      {family === 'ac' && <M5Row label="center1_freq" value={s.centerFreq1 != null ? formatMHz(s.centerFreq1) : null} />}
      {family === 'ac' && <M5Row label="tx_idx" value={s.txIdx != null ? String(s.txIdx) : null} />}
      {family === 'ac' && <M5Row label="rx_idx" value={s.rxIdx != null ? String(s.rxIdx) : null} />}
      {family === 'ac' && <M5Row label="tx_nss" value={s.txNss != null ? String(s.txNss) : null} />}
      {family === 'ac' && <M5Row label="rx_nss" value={s.rxNss != null ? String(s.rxNss) : null} />}
      {family === 'ac' && <M5Row label="tx_chainmask" value={s.txChainmask != null ? String(s.txChainmask) : null} />}
      {family === 'ac' && <M5Row label="rx_chainmask" value={s.rxChainmask != null ? String(s.rxChainmask) : null} />}
      {family === 'ac' && s.chainNames && s.chainNames.length > 0 && (
        <M5Row label="chain_names" value={s.chainNames.join(', ')} />
      )}
      <M5Row label="txrate" value={s.txRate != null ? formatMbps(s.txRate) : null} />
      <M5Row label="rxrate" value={s.rxRate != null ? formatMbps(s.rxRate) : null} />
      <M5Row label="chains" value={s.chains} />
      <M5Row label="airMAX quality" value={s.airmaxQuality != null ? formatPercent(s.airmaxQuality) : null} />
      <M5Row label="airMAX capacity" value={s.airmaxCapacity != null ? formatPercent(s.airmaxCapacity) : null} />
      <M5Row label="airMAX priority" value={s.airmaxPriority} />
      {family === 'ac' && <M5Row label="dcap" value={s.dcap != null ? formatPercent(s.dcap) : null} />}
      {family === 'ac' && <M5Row label="ucap" value={s.ucap != null ? formatPercent(s.ucap) : null} />}
      {family === 'ac' && <M5Row label="airtime total" value={s.airtime != null ? formatPercent(s.airtime) : null} />}
      {family === 'ac' && <M5Row label="tx_airtime" value={s.txAirtime != null ? formatPercent(s.txAirtime) : null} />}
      {family === 'ac' && <M5Row label="rx_airtime" value={s.rxAirtime != null ? formatPercent(s.rxAirtime) : null} />}
      {family === 'ac' && <M5Row label="cinr" value={s.cinr != null ? `${s.cinr} dB` : null} />}
      {family === 'ac' && <M5Row label="evm" value={s.evm} />}
      {family === 'ac' && <M5Row label="tx_latency" value={s.txLatency != null ? formatMs(s.txLatency) : null} />}
      {family === 'ac' && <M5Row label="fixed_frame" value={s.fixedFrame != null ? formatBool(s.fixedFrame, 'Sí', 'No') : null} />}
      {family === 'ac' && <M5Row label="gps_sync" value={s.gpsSync != null ? formatBool(s.gpsSync, 'Sincronizado', 'No') : null} />}
      {family === 'm5' && <M5Row label="airsync_mode" value={s.airsyncMode} />}
      {family === 'm5' && <M5Row label="atpc_status" value={s.atpcStatus} />}
      {family === 'm5' && <M5Row label="tx_retries" value={s.txRetries != null ? String(s.txRetries) : null} />}
      {family === 'm5' && <M5Row label="missed_beacons" value={s.missedBeacons != null ? String(s.missedBeacons) : null} />}
      {family === 'm5' && <M5Row label="rx_crypts" value={s.rxCrypts != null ? String(s.rxCrypts) : null} />}
    </M5Section>
  );
}
