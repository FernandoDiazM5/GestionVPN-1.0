// ============================================================
//  lib/apPersist.js (E1) — persistencia + enriquecimiento de las
//  estaciones (CPEs) leídas de un AP. Extraído para reutilizar entre
//  los endpoints de poll y el apPollJob, sin duplicar el SQL.
// ============================================================
const { getCpeIntId } = require('../db.service');

const isValidMac = (mac) => /^([0-9a-f]{2}:?){5}([0-9a-f]{2})$/i.test(mac);

/**
 * UPSERT atómico de las estaciones en `cpes` (+ signal_history si saveHistory).
 * @param db        shim de db.service (run/all/get; soporta BEGIN/COMMIT/ROLLBACK)
 * @param apIntId   id entero del AP (FK)
 * @param stations  estaciones crudas de pollAp()
 * @param saveHistory ¿persistir punto en signal_history?
 */
async function persistStations(db, apIntId, stations, saveHistory = false) {
  await db.run('BEGIN');
  try {
    for (const sta of stations) {
      if (!sta.mac || !isValidMac(sta.mac)) continue;
      await db.run(
        `INSERT INTO cpes
         (mac,ap_id,ip_lan,last_seen,last_stats,remote_hostname,remote_platform)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(mac) DO UPDATE SET
           last_seen=excluded.last_seen,
           ap_id=excluded.ap_id,
           ip_lan=COALESCE(excluded.ip_lan, ip_lan),
           last_stats=excluded.last_stats,
           remote_hostname=COALESCE(excluded.remote_hostname, remote_hostname),
           remote_platform=COALESCE(excluded.remote_platform, remote_platform)`,
        [sta.mac, apIntId, sta.lastip || null, Date.now(), JSON.stringify(sta),
         sta.remote_hostname || null, sta.remote_platform || null]
      );
      if (saveHistory && apIntId) {
        const cpeIntId = await getCpeIntId(sta.mac);
        if (cpeIntId) {
          await db.run(
            `INSERT INTO signal_history
             (cpe_id,ap_id,timestamp,signal_dbm,remote_signal_dbm,noisefloor_dbm,
              cinr_db,ccq_pct,distancia_km,downlink_mbps,uplink_mbps,airtime_tx,airtime_rx)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [cpeIntId, apIntId, Date.now(), sta.signal, sta.remote_signal, sta.noisefloor,
             sta.airmax_cinr_rx, sta.ccq,
             sta.distance != null ? Math.round(sta.distance / 1000 * 100) / 100 : null,
             sta.tx_rate ?? null, sta.rx_rate ?? null,
             sta.airmax_tx_usage, sta.airmax_rx_usage]
          );
        }
      }
    }
    await db.run('COMMIT');
  } catch (e) {
    await db.run('ROLLBACK');
    throw e;
  }
}

/** Adjunta hostname/modelo conocidos (de `cpes`) a las estaciones. */
async function enrichStations(db, stations) {
  const macs = stations.map(s => s.mac).filter(Boolean);
  const known = macs.length > 0
    ? await db.all(`SELECT * FROM cpes WHERE mac IN (${macs.map(() => '?').join(',')})`, macs)
    : [];
  const km = {};
  known.forEach(k => { km[k.mac] = k; });
  return stations.map(sta => ({
    ...sta,
    hostname: km[sta.mac]?.hostname || null,
    modelo: km[sta.mac]?.modelo || null,
    isKnown: !!(km[sta.mac]?.hostname),
  }));
}

module.exports = { persistStations, enrichStations, isValidMac };
