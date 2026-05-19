const http = require('http');
const https = require('https');
const net = require('net');
const { Client: SSH2Client } = require('ssh2');

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}$/;
const CIDR_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}\/(3[0-2]|[1-2]\d|\d)$/;

// Comando SSH combinado — 14 secciones, BusyBox compatible
// NOTA: cada echo lleva \n previo para evitar que markers se peguen a la salida anterior
// (BusyBox wstalist/mca-status pueden no emitir trailing newline)
const ANTENNA_CMD = [
    'echo __MCA__',     '/usr/www/status.cgi 2>/dev/null || mca-status 2>/dev/null',
    'echo "";echo __CFG__',     'cat /tmp/system.cfg 2>/dev/null',
    'echo "";echo __HN__',      'cat /proc/sys/kernel/hostname 2>/dev/null',
    'echo "";echo __VER__',     'cat /etc/version 2>/dev/null',
    'echo "";echo __IFC__',     'ifconfig 2>/dev/null',
    'echo "";echo __UNAME__',   'uname -a 2>/dev/null; uptime 2>/dev/null',
    'echo "";echo __MEMINFO__', 'cat /proc/meminfo 2>/dev/null',
    'echo "";echo __ROUTES__',  'route -n 2>/dev/null',
    'echo "";echo __IWCFG__',   'iwconfig ath0 2>/dev/null',
    'echo "";echo __WSTA__',    'wstalist 2>/dev/null',
    'echo "";echo __MCACLI__',  'mca-cli-op info 2>/dev/null',
    'echo "";echo __NETDEV__',  'cat /proc/net/dev 2>/dev/null',
    'echo "";echo __BOARD__',   'cat /etc/board.info 2>/dev/null || cat /tmp/board.info 2>/dev/null',
].join('; ');

// ── Decodifica entidades HTML (&# y &; notación) ─────────────
const decodeHtmlEntities = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');  // Debe ser último
};

const getSubnetHosts = (cidr) => {
    const [network, bits] = cidr.split('/');
    const prefixLen = parseInt(bits, 10);
    const toNum = addr => addr.split('.').reduce((acc, oct) => ((acc << 8) | parseInt(oct, 10)) >>> 0, 0);
    const toIP = num => [24, 16, 8, 0].map(b => (num >>> b) & 0xff).join('.');
    const mask = prefixLen > 0 ? (~0 << (32 - prefixLen)) >>> 0 : 0;
    const netBase = (toNum(network) & mask) >>> 0;
    const total = 1 << (32 - prefixLen);
    const ips = [];
    for (let i = 1; i < total - 1; i++) ips.push(toIP((netBase + i) >>> 0));
    return ips;
};

const probeStatusCgi = (deviceIP, port, useHttps) => {
    return new Promise((resolve) => {
        const lib = useHttps ? https : http;
        const req = lib.request({
            hostname: deviceIP, port, path: '/status.cgi', method: 'GET', timeout: 2000,
            headers: { Accept: 'application/json, */*', Connection: 'close' }, rejectUnauthorized: false,
        }, (res) => {
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return resolve(null);
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (!data || !data.host || !data.host.devmodel) return resolve(null);
                    const h = data.host; const w = data.wireless || {};
                    // Parsear JSON completo de /status.cgi con el mismo parser que mca-status via SSH.
                    // Así el modal M5 muestra todos los campos desde el primer escaneo HTTP, sin SSH.
                    const cachedStats = parseAirOSStats(body);
                    resolve({
                        ip: deviceIP, mac: (h.macaddr || '').toUpperCase(), name: decodeHtmlEntities(h.hostname || deviceIP),
                        model: h.devmodel || 'Unknown', firmware: h.fwversion || 'Unknown',
                        role: (['master', 'ap', 'apauto', 'ap-ptp', 'ap-ptmp'].includes(w.mode)) ? 'ap' : (w.mode ? 'sta' : 'unknown'),
                        parentAp: decodeHtmlEntities((w.remote && w.remote.hostname) || w.essid || ''), essid: decodeHtmlEntities(w.essid || ''), frequency: parseInt(w.frequency) || 0,
                        cachedStats,
                    });
                } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end();
    });
};

const getSSHBanner = (host, port = 22, timeout = 2000) => new Promise((resolve) => {
    const sock = new net.Socket();
    let banner = '';
    const timer = setTimeout(() => { sock.destroy(); resolve(null); }, timeout);
    sock.connect(port, host, () => { });
    sock.on('data', (data) => { banner += data.toString(); clearTimeout(timer); sock.destroy(); resolve(banner); });
    sock.on('error', () => { clearTimeout(timer); resolve(null); });
    sock.on('timeout', () => { sock.destroy(); clearTimeout(timer); resolve(null); });
});

const probeUbiquiti = async (deviceIP) => {
    const [http80, https443] = await Promise.all([probeStatusCgi(deviceIP, 80, false), probeStatusCgi(deviceIP, 443, true)]);
    if (http80 || https443) return http80 || https443;
    const banner = await getSSHBanner(deviceIP, 22, 2000);
    if (banner && banner.toLowerCase().includes('dropbear')) {
        return { ip: deviceIP, mac: '', name: deviceIP, model: 'Ubiquiti airOS (SSH)', firmware: 'desconocido', role: 'unknown', parentAp: '', essid: '', frequency: 0 };
    }
    return null;
};

const sshExec = (host, port, username, password, command, timeoutMs = 10000, readyTimeoutMs = 8000) => {
    return new Promise((resolve, reject) => {
        const conn = new SSH2Client();
        let output = '';
        const globalTimer = setTimeout(() => { conn.destroy(); reject(new Error('Tiempo de espera SSH agotado')); }, timeoutMs);
        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) { clearTimeout(globalTimer); conn.end(); return reject(err); }
                stream.on('data', data => { output += data.toString(); });
                stream.stderr.on('data', () => { });
                stream.on('close', () => { clearTimeout(globalTimer); conn.end(); resolve(output.trim()); });
            });
        });
        conn.on('error', err => { clearTimeout(globalTimer); reject(err); });
        conn.connect({
            host, port: port || 22, username, password, readyTimeout: readyTimeoutMs,
            algorithms: {
                kex: ['ecdh-sha2-nistp256', 'diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1'],
                serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256'],
                cipher: ['aes128-ctr', 'aes256-ctr', 'aes128-cbc', '3des-cbc'], hmac: ['hmac-sha1', 'hmac-sha2-256', 'hmac-md5'],
            },
        });
    });
};

const parseAirOSStats = (output) => {
    const pick = (sources, ...keys) => {
        for (const src of sources) {
            if (!src || typeof src !== 'object') continue;
            for (const key of keys) { const v = src[key]; if (v != null && v !== '' && v !== 0) return v; }
        }
        return null;
    };
    const pickNum = (sources, ...keys) => {
        for (const src of sources) {
            if (!src || typeof src !== 'object') continue;
            for (const key of keys) { const v = src[key]; if (v != null && v !== '') return v; }
        }
        return null;
    };

    try {
        // Extrae el bloque JSON aunque mca-status emita texto adicional antes/después
        let jsonStr = output.trim();
        if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
            const s = jsonStr.indexOf('{');
            const e = jsonStr.lastIndexOf('}');
            if (s !== -1 && e > s) jsonStr = jsonStr.slice(s, e + 1);
        }
        const data = JSON.parse(jsonStr);
        const h = data.host || {}; const w = data.wireless || {};
        // airOS M-series anida airmax dentro de wireless; AC-series lo pone en raíz
        const am = data.airmax || w.airmax || {};
        const ifaces = Array.isArray(data.interfaces) ? data.interfaces : [];

        // Convierte tasa a Mbps. airOS M reporta txrate/rxrate en kbps (ej: 150000 = 150 Mbps).
        // Heurística por rango (max WiFi real ~1.7 Gbps):
        //   > 1_700_000 → viene en bps  → /1_000_000
        //   > 1_700     → viene en kbps → /1_000
        //   ≤ 1_700     → ya viene en Mbps
        const toMbps = raw => {
            if (raw == null || raw === '') return null;
            const v = parseInt(raw);
            if (isNaN(v) || v < 0) return null;
            if (v > 1_700_000) return Math.round(v / 1_000_000);
            if (v > 1_700)     return Math.round(v / 1_000);
            return v;
        };
        const toCCQ = raw => raw != null ? parseFloat((parseInt(raw) / 10).toFixed(1)) : null;
        // Versión sin el filtro v !== 0 de pick(), para capturar valores numéricos incluyendo 0
        const pn = (src, ...keys) => { for (const k of keys) { const v = src?.[k]; if (v != null && v !== '') return v; } return null; };

        let memoryPercent = null; const memObj = h.memory || data.memory || {};
        if (memObj.total > 0) memoryPercent = Math.round(((memObj.total - memObj.free) / memObj.total) * 100);
        else if (h.memtotal > 0) memoryPercent = Math.round(((h.memtotal - h.memfree) / h.memtotal) * 100);

        // uptime — usar pickNum para no perder uptime=0 (justo arrancó)
        let uptimeStr = null;
        const uptimeSec = pickNum([h, data], 'uptime');
        if (uptimeSec != null) {
            const d = Math.floor(uptimeSec / 86400), hh = Math.floor((uptimeSec % 86400) / 3600), mm = Math.floor((uptimeSec % 3600) / 60), ss = uptimeSec % 60;
            uptimeStr = d > 0 ? `${d}d ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        }

        const freq = parseInt(pickNum([w, data], 'frequency', 'freq', 'cf', 'center_freq'));
        const rawExt = (pick([w, data], 'chanbw_cfg', 'chanbwcfg', 'channel_ext', 'ht_mode', 'chanExt') || '').toString().toUpperCase();
        // channelWidth — usar pickNum para no perder valor 0; el entero NaN → null
        const chanbwRaw = pickNum([w, data], 'chanbw', 'bw', 'cbw', 'channel_width', 'chwidth');
        const chanbw = chanbwRaw != null ? parseInt(chanbwRaw) : NaN;

        const wlanMac = (pick([ifaces.find(i => /^(wlan|ath)/i.test(i.ifname)), h, w, data], 'hwaddr', 'macaddr', 'mac', 'wlanmac') || '').toUpperCase();
        const lanMac = ((ifaces.find(i => /^(eth|br)/i.test(i.ifname))?.hwaddr || pick([h, data], 'lanmac', 'lan_mac')) || '').toUpperCase();
        const rawApMac = pick([w.remote, w, data], 'mac', 'apmac', 'bssid');
        const apMac = rawApMac && rawApMac.toUpperCase() !== wlanMac ? rawApMac.toUpperCase() : null;

        // Señal y noise — pickNum para no perder valores negativos a través del filtro != 0
        const signalRaw  = pn(w, 'signal', 'rssi', 'rx_signal') ?? pn(data, 'signal', 'rssi');
        const noiseRaw   = pn(w, 'noisefloor', 'noise_floor', 'noise', 'rx_noisefloor') ?? pn(data, 'noisefloor', 'noise_floor');
        const cpuRaw     = pn(h, 'cpuload', 'cpu_load', 'cpu') ?? pn(data, 'cpuload', 'cpu');
        const txPowerRaw = pn(w, 'txpower', 'tx_power', 'txpwr') ?? pn(data, 'txpower');

        // AirMax — parseInt(0) es 0, not null
        const amQuality  = pn(am, 'quality') ?? pn(data, 'airmax_quality');
        const amCapacity = pn(am, 'capacity') ?? pn(data, 'airmax_capacity');

        return {
            signal:          signalRaw  != null ? parseInt(signalRaw)  : null,
            noiseFloor:      noiseRaw   != null ? parseInt(noiseRaw)   : null,
            ccq:             toCCQ(pickNum([w, data], 'ccq', 'txccq')),
            txRate:          toMbps(pickNum([w, data], 'txrate', 'tx_rate', 'linkspeed')),
            rxRate:          toMbps(pickNum([w, data], 'rxrate', 'rx_rate')),
            cpuLoad:         cpuRaw     != null ? parseInt(cpuRaw)     : null,
            memoryPercent,
            airmaxQuality:   amQuality  != null ? parseInt(amQuality)  : null,
            airmaxCapacity:  amCapacity != null ? parseInt(amCapacity) : null,
            uptimeStr,
            deviceDate: pick([h, data], 'time', 'date', 'localtime') || null,
            stations: (data.sta || data.stations || []).map(s => ({
                mac:        (s.mac || '').toUpperCase(),
                signal:     s.signal != null ? parseInt(s.signal) : (s.rssi != null ? parseInt(s.rssi) : null),
                noiseFloor: s.noisefloor != null ? parseInt(s.noisefloor) : null,
                ccq:        toCCQ(s.ccq ?? s.txccq),
                txRate:     toMbps(s.txrate ?? s.tx_rate),
                rxRate:     toMbps(s.rxrate ?? s.rx_rate),
                distance:   s.ackdistance ?? (s.distance || null),
                uptime:     s.uptime ?? null,
                txLatency:  s.tx_latency ?? null,
                txPower:    s.txpower != null ? parseInt(s.txpower) : null,
                hostname:   decodeHtmlEntities(s.name || s.remote?.hostname || null),
                remoteModel: s.remote?.platform || null,
                lastIp:     s.lastip || null,
                airmaxQuality:  s.airmax?.quality ?? null,
                airmaxCapacity: s.airmax?.capacity ?? null,
            })),
            deviceName:      decodeHtmlEntities(pick([h, data], 'hostname', 'name', 'devname') || null),
            deviceModel:     pick([h, data], 'devmodel', 'product', 'model') || null,
            firmwareVersion: pick([h, data], 'fwversion', 'version', 'fw') || null,
            wlanMac: wlanMac || null, lanMac: lanMac || null, apMac,
            essid:       decodeHtmlEntities(pick([w, data], 'essid', 'ssid') || null),
            security:    pick([w, data], 'security', 'auth', 'encrypt') || null,
            mode:        pick([w, data], 'mode', 'wmode', 'opermode') || null,
            networkMode: pick([h, data], 'netrole', 'network_mode', 'role') || null,
            frequency:     isNaN(freq)   ? null : freq,
            channelWidth:  isNaN(chanbw) ? null : chanbw,
            txPower:       txPowerRaw != null ? parseInt(txPowerRaw) : null,
            distance: pick([w, data], 'ackdistance', 'distance') || null,
            chains: (() => { const c = parseInt(pick([w, data], 'chains', 'txchains', 'rxchains')); return c > 0 ? `${c}X${c}` : null; })(),
            airmaxEnabled: am.enabled != null ? !!am.enabled : undefined,
            airmaxPriority:  am.priority ? String(am.priority) : null,
            rssi:            pn(w, 'rssi') != null ? parseInt(pn(w, 'rssi')) : null,
            txRetries:       (w.stats?.tx_retries != null) ? parseInt(w.stats.tx_retries) : null,
            missedBeacons:   (w.stats?.missed_beacons != null) ? parseInt(w.stats.missed_beacons) : null,
            rxCrypts:        (w.stats?.rx_crypts != null) ? parseInt(w.stats.rx_crypts) : null,
            chainRssi:       Array.isArray(w.chainrssi) ? w.chainrssi.map(v => parseInt(v)).filter(v => !isNaN(v)) : null,
            airsyncMode:     w.airsync_mode != null ? String(w.airsync_mode) : null,
            atpcStatus:      w.atpc_status != null ? String(w.atpc_status) : null,
            opmode:          pick([w, data], 'opmode', 'htmode', 'ieee_mode') || null,
            countryCode:     w.countrycode != null ? String(w.countrycode) : null,
            fwPrefix:        h.fwprefix || null,
            // ── Campos M5/comunes no devueltos anteriormente ─────────────────
            channelNumber:   pn(w, 'channel', 'chan', 'chnum', 'chindex') != null ? parseInt(pn(w, 'channel', 'chan', 'chnum', 'chindex')) : null,
            channelWidthExt: (() => {
                if (!rawExt) return null;
                // Cubre: "HT40-", "HT40MINUS", "ht40minus", "BELOW", "LOWER"
                if (/HT40[-_]?MINUS|HT40-|BELOW|LOWER/i.test(rawExt)) return 'Inferior (HT40-)';
                // Cubre: "HT40+", "HT40PLUS", "ht40plus", "ABOVE", "UPPER"
                if (/HT40[-_]?PLUS|HT40\+|ABOVE|UPPER/i.test(rawExt)) return 'Superior (HT40+)';
                if (/HT20|NONE/i.test(rawExt)) return null;
                return rawExt || null;
            })(),
            freqRange:       pick([w, data], 'freq_range', 'freqrange', 'channel_range') || null,
            antenna:         pick([w, data], 'antenna', 'antenna_type', 'antennatype') || null,
            lanSpeed: (() => {
                const ethIfc = ifaces.find(i => /^(eth|br)/i.test(i.ifname));
                return ethIfc?.status?.speed != null ? parseInt(ethIfc.status.speed) : null;
            })(),
            lanInfo: (() => {
                const ethIfc = ifaces.find(i => /^(eth|br)/i.test(i.ifname));
                if (!ethIfc?.status) return null;
                const spd = ethIfc.status.speed; const dup = ethIfc.status.duplex;
                if (spd != null && dup != null) return `${spd}Mbps-${dup ? 'Full' : 'Half'}`;
                if (spd != null) return `${spd}Mbps`;
                return null;
            })(),
            memTotalKb: (() => {
                const m = h.memory || data.memory || {};
                return m.total != null ? parseInt(m.total) : (h.memtotal != null ? parseInt(h.memtotal) : null);
            })(),
            memFreeKb: (() => {
                const m = h.memory || data.memory || {};
                return m.free != null ? parseInt(m.free) : (h.memfree != null ? parseInt(h.memfree) : null);
            })(),
            memBuffersKb: (() => {
                const m = h.memory || data.memory || {};
                return m.buffers != null ? parseInt(m.buffers) : null;
            })(),
            memCachedKb: (() => {
                const m = h.memory || data.memory || {};
                return m.cached != null ? parseInt(m.cached) : null;
            })(),
            // Campos AC-específicos ──────────────────────────────────────────
            temperature:  h.temperature != null ? parseFloat(h.temperature) : null,
            deviceHeight: h.height      != null ? parseFloat(h.height)      : null,
            loadAvg:      h.loadavg != null ? String(h.loadavg) : null,
            hideSsid:     w.hide_essid != null ? !!w.hide_essid : undefined,
            antennaGain:  pn(w, 'antenna_gain') != null ? parseFloat(pn(w, 'antenna_gain')) : null,
            centerFreq1:  pn(w, 'center1_freq', 'center_freq1', 'cf1') != null ? parseInt(pn(w, 'center1_freq', 'center_freq1', 'cf1')) : null,
            txIdx:        pn(w, 'tx_idx')  != null ? parseInt(pn(w, 'tx_idx'))  : null,
            rxIdx:        pn(w, 'rx_idx')  != null ? parseInt(pn(w, 'rx_idx'))  : null,
            txNss:        pn(w, 'tx_nss')  != null ? parseInt(pn(w, 'tx_nss'))  : null,
            rxNss:        pn(w, 'rx_nss')  != null ? parseInt(pn(w, 'rx_nss'))  : null,
            txChainmask:  pn(w, 'tx_chainmask') != null ? parseInt(pn(w, 'tx_chainmask')) : null,
            rxChainmask:  pn(w, 'rx_chainmask') != null ? parseInt(pn(w, 'rx_chainmask')) : null,
            chainNames:   Array.isArray(w.chain_names) ? w.chain_names.map(String) : null,
            cinr:         pn(w, 'cinr') != null ? parseFloat(pn(w, 'cinr')) : null,
            evm:          w.evm != null ? String(w.evm) : null,
            gpsSync:      w.gps_sync    != null ? !!w.gps_sync    : undefined,
            fixedFrame:   w.fixed_frame != null ? !!w.fixed_frame : undefined,
            // Polling AC (dcap/ucap/airtime)
            dcap:      (() => { const v = pn(data.polling || am, 'dcap', 'dl_capacity'); return v != null ? parseFloat(v) : null; })(),
            ucap:      (() => { const v = pn(data.polling || am, 'ucap', 'ul_capacity'); return v != null ? parseFloat(v) : null; })(),
            airtime:   (() => { const v = pn(data.polling || am, 'use', 'airtime');    return v != null ? parseFloat(v) : null; })(),
            txAirtime: (() => { const v = pn(data.polling || am, 'tx_use', 'tx_airtime'); return v != null ? parseFloat(v) : null; })(),
            rxAirtime: (() => { const v = pn(data.polling || am, 'rx_use', 'rx_airtime'); return v != null ? parseFloat(v) : null; })(),
            // TX latency desde sta remota
            txLatency: (() => {
                const staArr = Array.isArray(data.sta) ? data.sta : (data.sta ? [data.sta] : []);
                const first = staArr[0];
                return first?.tx_latency != null ? parseFloat(first.tx_latency) : null;
            })(),
            // Interfaces — extendidas con campos AC
            ifaceDetails: ifaces.map(ifc => ({
                ifname:     ifc.ifname || '',
                hwaddr:     (ifc.hwaddr || '').toUpperCase(),
                mtu:        ifc.mtu        != null ? parseInt(ifc.mtu)        : null,
                ipaddr:     ifc.ipaddr     || ifc.status?.ipaddr || null,
                enabled:    ifc.status?.enabled ?? null,
                plugged:    ifc.status?.plugged ?? null,
                speed:      ifc.status?.speed   ?? null,
                duplex:     ifc.status?.duplex  ?? null,
                dhcpc:      ifc.services?.dhcpc ?? ifc.dhcpc ?? null,
                dhcpd:      ifc.services?.dhcpd ?? ifc.dhcpd ?? null,
                pppoe:      ifc.services?.pppoe ?? ifc.pppoe ?? null,
                snr:        ifc.status?.snr      != null ? parseFloat(ifc.status.snr)      : null,
                cableLen:   ifc.status?.cable_len!= null ? parseFloat(ifc.status.cable_len): null,
                txBytesIfc: ifc.stats?.tx_bytes  != null ? parseInt(ifc.stats.tx_bytes)   : null,
                rxBytesIfc: ifc.stats?.rx_bytes  != null ? parseInt(ifc.stats.rx_bytes)   : null,
                txErrors:   ifc.stats?.tx_errors != null ? parseInt(ifc.stats.tx_errors)  : null,
                rxErrors:   ifc.stats?.rx_errors != null ? parseInt(ifc.stats.rx_errors)  : null,
            })).filter(i => i.ifname),
            _rawJson: (() => { try { return JSON.stringify(JSON.parse(output), null, 2).slice(0, 8000); } catch { return null; } })(),
        };
    } catch {
        try {
            const kv = {}; output.split('\n').forEach(line => { const eq = line.indexOf('='); if (eq > 0) kv[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim(); });
            if (Object.keys(kv).length > 0) {
                // Misma heurística de toMbps para el parser fallback KV
                const toMbps = raw => {
                    if (raw == null || raw === '') return null;
                    const v = parseInt(raw);
                    if (isNaN(v) || v < 0) return null;
                    if (v > 1_700_000) return Math.round(v / 1_000_000);
                    if (v > 1_700)     return Math.round(v / 1_000);
                    return v;
                };
                const toCCQ = v => v != null ? parseFloat((parseInt(v) / 10).toFixed(1)) : null;
                const kget = (...keys) => { for (const k of keys) { const v = kv[k]; if (v != null && v !== '') return v; } return null; };
                const kgetN = (...keys) => { for (const k of keys) { if (kv[k] != null && kv[k] !== '') return kv[k]; } return null; };
                const upSec = parseInt(kget('uptime', 'up_time'));
                let uptimeStr = null;
                if (!isNaN(upSec)) {
                    const d = Math.floor(upSec / 86400), hh = Math.floor((upSec % 86400) / 3600), mm = Math.floor((upSec % 3600) / 60), ss = upSec % 60;
                    uptimeStr = d > 0 ? `${d}d ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
                }
                const sigRaw = kgetN('signal', 'rssi');
                const noRaw  = kgetN('noisefloor', 'noise_floor');
                const cpuRaw = kgetN('cpu', 'cpuload', 'cpu_load');
                const txpRaw = kgetN('txpower', 'tx_power');
                const bwRaw  = kgetN('chanbw', 'channel_width', 'bw');
                return {
                    signal:      sigRaw  != null ? parseInt(sigRaw)  : null,
                    noiseFloor:  noRaw   != null ? parseInt(noRaw)   : null,
                    ccq:         toCCQ(kget('ccq', 'txccq')),
                    txRate:      toMbps(kget('txrate', 'tx.rate')),
                    rxRate:      toMbps(kget('rxrate', 'rx.rate')),
                    cpuLoad:     cpuRaw  != null ? parseInt(cpuRaw)  : null,
                    txPower:     txpRaw  != null ? parseInt(txpRaw)  : null,
                    channelWidth: bwRaw  != null ? parseInt(bwRaw)   : null,
                    uptimeStr,
                    frequency:   parseInt(kget('frequency', 'freq')) || null,
                    essid:       kget('essid', 'ssid') || null,
                    mode: (() => { const m = (kget('mode', 'wmode') || '').toLowerCase(); return ['master','ap','apauto','ap-ptp','ap-ptmp'].includes(m) ? 'ap' : ['station','sta','managed'].includes(m) ? 'sta' : m || null; })(),
                    deviceName:  kget('hostname', 'name') || null,
                    deviceModel: kget('devmodel', 'product', 'model') || null,
                    firmwareVersion: kget('fwversion', 'version') || null,
                    wlanMac: (kget('wlan.mac', 'wlanmac', 'mac') || '').toUpperCase() || null,
                    lanMac:  (kget('lan.mac', 'lanmac') || '').toUpperCase() || null,
                    apMac:   (kget('apmac', 'ap.mac', 'bssid') || '').toUpperCase() || null,
                    airmaxEnabled: kget('airmax.status', 'airmax') === 'enabled' || undefined,
                    stations: [],
                };
            }
        } catch { }
        return { raw: output.slice(0, 3000) };
    }
};

// ── Parser para /tmp/system.cfg (key=value de airOS) ─────────────────────
const parseSystemCfg = (cfgText) => {
    if (!cfgText || typeof cfgText !== 'string' || cfgText.trim() === '') return {};
    const kv = {};
    cfgText.split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0) kv[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
    });

    // Busca en radio.1.KEY, radio.2.KEY y radio.KEY
    const r = (...suffixes) => {
        for (const pfx of ['radio.1', 'radio.2', 'radio']) {
            for (const s of suffixes) {
                const v = kv[`${pfx}.${s}`];
                if (v != null && v !== '') return v;
            }
        }
        return null;
    };
    const get = (...keys) => { for (const k of keys) { const v = kv[k]; if (v != null && v !== '') return v; } return null; };

    const rawMode = r('mode');
    let mode = null;
    if (rawMode) {
        const m = rawMode.toLowerCase();
        if (['master', 'ap', 'apauto', 'ap-ptp', 'ap-ptmp'].includes(m)) mode = 'ap';
        else if (['station', 'sta', 'managed'].includes(m)) mode = 'sta';
        else mode = rawMode;
    }

    const freqRaw  = r('freq', 'frequency');
    const bwRaw    = r('chanbw', 'channel_width', 'bw');
    const txpRaw   = r('txpower', 'tx_power');
    const freq     = freqRaw  ? parseInt(freqRaw)  : null;
    const chanbw   = bwRaw    ? parseInt(bwRaw)    : null;
    const txPower  = txpRaw   ? parseInt(txpRaw)   : null;
    const amRaw    = get('airmaxac.status', 'airmax.status', 'radio.1.airmaxac.status', 'radio.1.airmax.status');

    return {
        mode,
        networkMode:    get('netmode', 'network.1.role') || null,
        security:       r('security') || null,
        frequency:      isNaN(freq)   ? null : freq,
        channelWidth:   isNaN(chanbw) ? null : chanbw,
        txPower:        isNaN(txPower)? null : txPower,
        deviceName:     get('resolv.host.1.name', 'system.hostname', 'syslog.devname') || null,
        essid:          r('ssid') || null,
        airmaxEnabled:  amRaw != null ? (amRaw === 'enabled' || amRaw === '1') : undefined,
    };
};

// ── Parser para ifconfig (obtiene MACs de ath0/eth0) ─────────────────────
const parseIfconfig = (ifcText) => {
    if (!ifcText || typeof ifcText !== 'string') return {};
    const result = { wlanMac: null, lanMac: null };
    // Cada bloque empieza por un nombre de interfaz al inicio de línea
    const blocks = ifcText.split(/\n(?=[a-zA-Z])/);
    for (const block of blocks) {
        const nameMatch = block.match(/^([a-zA-Z0-9._-]+)/);
        if (!nameMatch) continue;
        const ifName = nameMatch[1].toLowerCase();
        const hwMatch = block.match(/HWaddr\s+([\dA-Fa-f:]{17})/i)
                     || block.match(/ether\s+([\dA-Fa-f:]{17})/i);
        if (!hwMatch) continue;
        const mac = hwMatch[1].toUpperCase();
        if (/^(ath|wlan|wifi|ra\d)/.test(ifName) && !result.wlanMac) result.wlanMac = mac;
        else if (/^(eth|br|lan)/.test(ifName)     && !result.lanMac)  result.lanMac  = mac;
    }
    return result;
};

// ── Parser para /proc/net/dev (tráfico TX/RX por interfaz) ───────────────
const parseNetDev = (text) => {
    if (!text || typeof text !== 'string') return null;
    const ifaces = {};
    for (const line of text.split('\n')) {
        // formato: "  ath0:rxB rxP ... txB txP ..."
        const m = line.match(/^\s*([\w.]+):\s*(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s+(\d+)/);
        if (m && m[1] !== 'lo') {
            ifaces[m[1]] = {
                rxBytes:   parseInt(m[2]),
                rxPackets: parseInt(m[3]),
                txBytes:   parseInt(m[4]),
                txPackets: parseInt(m[5]),
            };
        }
    }
    return Object.keys(ifaces).length > 0 ? ifaces : null;
};

// ── Parser para /proc/meminfo ─────────────────────────────────────────────
const parseMeminfo = (text) => {
    if (!text || typeof text !== 'string') return {};
    const kb = (key) => {
        const m = text.match(new RegExp(`${key}:\\s*(\\d+)\\s*kB`, 'i'));
        return m ? parseInt(m[1]) : null;
    };
    return {
        memTotalKb:   kb('MemTotal'),
        memFreeKb:    kb('MemFree'),
        memBuffersKb: kb('Buffers'),
        memCachedKb:  kb('Cached'),
    };
};

// ── Parser para iwconfig ath0 ─────────────────────────────────────────────
const parseIwconfigData = (text) => {
    if (!text || typeof text !== 'string') return {};
    const m = (rx) => { const r = text.match(rx); return r ? r[1] : null; };
    const result = {};
    const essid   = m(/ESSID:"([^"]+)"/);
    const freqGhz = m(/Frequency:(\d+\.?\d*)\s*GHz/i);
    const apMac   = m(/Access Point:\s*([\dA-Fa-f:]{17})/i);
    const bitRate = m(/Bit Rate[=:](\d+(?:\.\d+)?)\s*Mb/i);
    const txPwr   = m(/Tx-Power[=:](\d+)\s*dBm/i);
    const sig     = m(/Signal level[=:](-?\d+)\s*dBm/i);
    const noise   = m(/Noise level[=:](-?\d+)\s*dBm/i);
    if (essid)   result.essid      = essid;
    if (freqGhz) result.frequency  = Math.round(parseFloat(freqGhz) * 1000);
    if (apMac)   result.apMac      = apMac.toUpperCase();
    if (bitRate) result.txRate     = parseFloat(bitRate);
    if (txPwr)   result.txPower    = parseInt(txPwr);
    if (sig)     result.signal     = parseInt(sig);
    if (noise)   result.noiseFloor = parseInt(noise);
    return result;
};

// ── Parser para mca-cli-op info (modelo human-readable, versión, nombre) ──
// Formato: "Model:                LiteBeam M5\nVersion:              WA.ar934x.v6.1.7..."
const parseMcaCli = (text) => {
    if (!text || typeof text !== 'string') return {};
    const get = (key) => {
        const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'));
        return m ? m[1].trim() : null;
    };
    // "Uptime:" (sin secs) tiene el string formateado "10d 04:28:25"
    // "Uptime(secs):" tiene el número — excluir esa línea
    const uptimeFormatted = (() => {
        const m = text.match(/^Uptime:\s+([^\n]+)$/im);
        if (!m) return null;
        const v = m[1].trim();
        // Si solo son dígitos, es el valor en segundos — no sirve como string
        return /^\d+$/.test(v) ? null : v;
    })();
    // Extrae el primer número (incluye negativos) de un campo con unidades: "-50 dBm" → -50
    const getNum = (key) => {
        const v = get(key);
        if (!v) return null;
        const matched = v.match(/(-?\d+(?:\.\d+)?)/);
        return matched ? parseFloat(matched[1]) : null;
    };
    return {
        deviceModel:     get('Model') || get('Platform') || null,
        firmwareVersion: get('Version') || null,
        deviceName:      get('DevName') || get('Hostname') || null,
        uptimeStr:       uptimeFormatted,
        // Fallbacks RF — confiables cuando mca-status JSON está incompleto o ausente
        signal:     getNum('Signal'),
        noiseFloor: getNum('Noise floor') ?? getNum('Noise Floor') ?? null,
        txRate:     getNum('TX rate')  ?? getNum('Tx Rate')  ?? getNum('Tx-Rate')  ?? null,
        rxRate:     getNum('RX rate')  ?? getNum('Rx Rate')  ?? getNum('Rx-Rate')  ?? null,
        ccq:        getNum('CCQ'),
    };
};

// ── Parser para wstalist (estaciones conectadas en modo AP) ───────────────
// Diferencias clave vs mca-status data.sta[]:
//   • ccq  → ya es 0–100 % (NO ×10)
//   • tx/rx → ya están en Mbps como float (NO en kbps)
//   • name, remote.hostname → nombre de la estación
//   • remote.platform → modelo de la estación remota
//   • airmax.quality/capacity → airmax por estación
const parseWstalist = (text) => {
    if (!text || typeof text !== 'string') return [];
    try {
        let jsonStr = text.trim();
        if (!jsonStr.startsWith('[')) {
            const s = jsonStr.indexOf('[');
            const e = jsonStr.lastIndexOf(']');
            if (s === -1 || e <= s) return [];
            jsonStr = jsonStr.slice(s, e + 1);
        }
        const arr = JSON.parse(jsonStr);
        if (!Array.isArray(arr)) return [];
        return arr.map(s => ({
            mac:            (s.mac || '').toUpperCase(),
            signal:         s.signal    != null ? parseInt(s.signal)    : null,
            noiseFloor:     s.noisefloor != null ? parseInt(s.noisefloor) : null,
            ccq:            s.ccq       != null ? parseFloat(s.ccq)     : null, // ya 0-100
            txRate:         s.tx        != null ? parseFloat(s.tx)      : null, // ya Mbps
            rxRate:         s.rx        != null ? parseFloat(s.rx)      : null,
            distance:       s.ackdistance ?? (s.distance > 0 ? s.distance : null),
            uptime:         s.uptime    ?? null,
            txLatency:      s.tx_latency ?? null,
            txPower:        s.txpower   != null ? parseInt(s.txpower)   : null,
            hostname:       s.name || s.remote?.hostname || null,
            remoteModel:    s.remote?.platform || null,
            lastIp:         s.lastip    || null,
            airmaxQuality:  s.airmax?.quality  ?? null,
            airmaxCapacity: s.airmax?.capacity ?? null,
        }));
    } catch { return []; }
};

// ── Parser para /etc/board.info (modelo del hardware) ────────────────────
const parseBoardInfo = (text) => {
    if (!text || typeof text !== 'string') return {};
    const kv = {};
    text.split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0) kv[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
    });
    return {
        deviceModel: kv['board.name'] || kv['board.shortname'] || null,
        boardId:     kv['board.sysid'] || null,
        fwPrefix:    kv['board.fwprefix'] || null,
    };
};

// ── Parser principal: fusiona las 14 fuentes de datos ────────────────────
const VALID_MARKERS = new Set(['MCA','CFG','HN','VER','IFC','UNAME','MEMINFO','ROUTES','IWCFG','WSTA','MCACLI','NETDEV','BOARD']);

const parseFullOutput = (combined) => {
    const sections = {};
    let cur = null;
    for (const line of combined.split('\n')) {
        // Marcador en su propia línea (caso normal)
        const m = line.match(/^__(MCA|CFG|HN|VER|IFC|UNAME|MEMINFO|ROUTES|IWCFG|WSTA|MCACLI|NETDEV|BOARD)__\s*$/);
        if (m && VALID_MARKERS.has(m[1])) { cur = m[1]; sections[cur] = ''; continue; }
        // Marcador pegado al final de la línea anterior (BusyBox sin trailing newline)
        const inlineM = line.match(/^(.+?)(__(MCA|CFG|HN|VER|IFC|UNAME|MEMINFO|ROUTES|IWCFG|WSTA|MCACLI|NETDEV|BOARD)__)\s*$/);
        if (inlineM && VALID_MARKERS.has(inlineM[3])) {
            if (cur) sections[cur] += inlineM[1] + '\n';
            cur = inlineM[3]; sections[cur] = ''; continue;
        }
        if (cur) sections[cur] += line + '\n';
    }

    const s   = (k) => (sections[k] || '').trim();
    const s1  = (k) => s(k).split('\n')[0].trim(); // primera línea

    const mcaRaw    = s('MCA');
    const cfgRaw    = s('CFG');
    const hnRaw     = s1('HN');
    const verRaw    = s1('VER');
    const ifcRaw    = s('IFC');
    const unameRaw  = s('UNAME');
    const meminfoRaw= s('MEMINFO');
    const routesRaw = s('ROUTES');
    const iwcfgRaw  = s('IWCFG');
    const wstaRaw   = s('WSTA');
    const mcacliRaw = s('MCACLI');
    const netdevRaw = s('NETDEV');

    const boardRaw  = s('BOARD');

    const base      = parseAirOSStats(mcaRaw || '{}');
    const cfg       = parseSystemCfg(cfgRaw);
    const ifc       = parseIfconfig(ifcRaw);
    const iwc       = parseIwconfigData(iwcfgRaw);
    const mem       = parseMeminfo(meminfoRaw);
    const traffic   = parseNetDev(netdevRaw);
    const mcaCli    = parseMcaCli(mcacliRaw);         // mca-cli-op info → modelo human-readable
    const wstaSta   = parseWstalist(wstaRaw);          // wstalist → estaciones
    const board     = parseBoardInfo(boardRaw);         // /etc/board.info → modelo hardware

    // Primera estación de wstalist — cuando el dispositivo es STA, esta ES su conexión al AP
    // y contiene rxRate, noiseFloor, ccq, distance que el JSON principal a veces no tiene
    const wstaFirst = wstaSta.length > 0 ? wstaSta[0] : null;

    const fill = (a, b) => (a != null && a !== '') ? a : (b != null && b !== '') ? b : null;

    // Calcular memoryPercent desde /proc/meminfo si mca-status no lo tiene
    const memPct = base.memoryPercent != null ? base.memoryPercent
        : (mem.memTotalKb > 0 ? Math.round(((mem.memTotalKb - (mem.memFreeKb || 0)) / mem.memTotalKb) * 100) : null);

    // CPU: load average (promediado 1min) es más confiable que host.cpuload (instantáneo,
    // sube a 100% por el propio SSH+status.cgi). Solo usar cpuload si load avg no existe.
    const cpuFromUptime = (() => {
        const loadMatch = unameRaw.match(/load average:\s*([\d.]+)/);
        if (loadMatch) return Math.min(100, Math.round(parseFloat(loadMatch[1]) * 100));
        return base.cpuLoad ?? null;
    })();

    return {
        ...base,
        // Modelo: mca-cli-op > board.info > status.cgi/mca-status JSON
        deviceModel:     mcaCli.deviceModel || board.deviceModel || base.deviceModel || null,
        // Nombre: /proc/sys/kernel/hostname > mca-status > system.cfg > mca-cli-op
        deviceName:      hnRaw || base.deviceName || cfg.deviceName || mcaCli.deviceName || null,
        // Firmware: /etc/version (primera línea) > mca-status > mca-cli-op
        firmwareVersion: verRaw || base.firmwareVersion || mcaCli.firmwareVersion || null,
        // Uptime: mca-status (calculado) > mca-cli-op (pre-formateado)
        uptimeStr:       base.uptimeStr || mcaCli.uptimeStr || null,
        mode:            fill(base.mode,        fill(cfg.mode,    iwc.mode)),
        networkMode:     fill(base.networkMode, cfg.networkMode),
        essid:           fill(base.essid,       fill(cfg.essid,   iwc.essid)),
        security:        fill(base.security,    cfg.security),
        frequency:       base.frequency    != null ? base.frequency    : (cfg.frequency    ?? iwc.frequency ?? null),
        channelWidth:    base.channelWidth != null ? base.channelWidth : (cfg.channelWidth ?? null),
        txPower:         base.txPower      != null ? base.txPower      : (cfg.txPower      ?? iwc.txPower  ?? null),
        airmaxEnabled:   base.airmaxEnabled != null ? base.airmaxEnabled : cfg.airmaxEnabled,
        fwPrefix:        base.fwPrefix || board.fwPrefix || null,
        wlanMac:         fill(base.wlanMac, ifc.wlanMac),
        lanMac:          fill(base.lanMac,  ifc.lanMac),
        apMac:           fill(base.apMac,   iwc.apMac),
        // ── Métricas RF: cascada de fuentes ──────────────────────────────────
        // Cada fuente se intenta en orden: JSON > mca-cli > iwconfig > wstalist[0]
        signal:          base.signal     != null ? base.signal     : (mcaCli.signal     ?? iwc.signal        ?? wstaFirst?.signal     ?? null),
        noiseFloor:      base.noiseFloor != null ? base.noiseFloor : (mcaCli.noiseFloor ?? iwc.noiseFloor    ?? wstaFirst?.noiseFloor ?? null),
        txRate:          base.txRate     != null ? base.txRate     : (mcaCli.txRate     ?? iwc.txRate        ?? wstaFirst?.txRate     ?? null),
        rxRate:          base.rxRate     != null ? base.rxRate     : (mcaCli.rxRate     ?? wstaFirst?.rxRate ?? null),
        ccq:             base.ccq        != null ? base.ccq        : (mcaCli.ccq        ?? wstaFirst?.ccq   ?? null),
        // Distancia: JSON > wstalist primera estación
        distance:        base.distance   != null ? base.distance   : (wstaFirst?.distance ?? null),
        // CPU y Memoria con fallback desde /proc y uptime
        cpuLoad:         cpuFromUptime,
        memoryPercent:   memPct,
        // Estaciones: mca-status data.sta[] (primario) → wstalist
        stations: (base.stations && base.stations.length > 0) ? base.stations : wstaSta,
        // Memoria detallada (/proc/meminfo)
        ...mem,
        // Tráfico TX/RX por interfaz (/proc/net/dev)
        ifaceTraffic: traffic,
        // Secciones raw — solo para diagnóstico en sesión, NO se guardan en DB
        _rawUname:    unameRaw   || null,
        _rawRoutes:   routesRaw  || null,
        _rawIwconfig: iwcfgRaw   || null,
        _rawWstalist: wstaRaw    || null,
        _rawMcaCli:   mcacliRaw  || null,
        _rawNetDev:   netdevRaw  || null,
        _rawMeminfo:  meminfoRaw || null,
        _rawBoard:    boardRaw   || null,
    };
};

const trySshCredentials = async (ip, credentialsArray) => {
    if (!credentialsArray || !credentialsArray.length) return null;
    for (const cred of credentialsArray) {
        if (!cred.user || !cred.pass) continue;
        try {
            // Comando combinado: 5 fuentes de datos en una sola conexión SSH
            const output = await sshExec(ip, 22, cred.user, cred.pass, ANTENNA_CMD, 20000, 8000);
            const stats = parseFullOutput(output);
            console.log(`[AUTO-SSH] ✓ Éxito en ${ip} usando la clave de: ${cred.user}`);
            return { user: cred.user, pass: cred.pass, port: 22, stats };
        } catch (err) {
            console.log(`[AUTO-SSH] ✗ Falló en ${ip} con ${cred.user} -> ${err.message}`);
            continue;
        }
    }
    return null;
};

module.exports = { IPV4_REGEX, CIDR_REGEX, getSubnetHosts, probeUbiquiti, sshExec, parseAirOSStats, parseFullOutput, ANTENNA_CMD, trySshCredentials, decodeHtmlEntities };