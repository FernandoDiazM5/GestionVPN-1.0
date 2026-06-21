// ============================================================
//  db/diagnostics.js — Diagnóstico READ-ONLY del estado multi-usuario.
//
//  Consolida los scripts sueltos de depuración (check_mgmt_ips / test_crypto)
//  en una sola herramienta SEGURA: NO escribe en la BD ni imprime secretos en
//  claro — del cifrado solo reporta si descifra OK (boolean), nunca el valor.
//
//  Muestra: IPs de gestión por usuario, scan-IPs por workspace, sesiones de
//  túnel activas, presencia de las claves MT_* del router y salud de descifrado.
//
//  Uso:  cd server && npm run diagnose
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const { getDb, decryptPass } = require('../db.service');

/** ¿descifra sin lanzar? No revela el valor. */
function decryptOk(enc) {
  if (!enc) return null;             // nada que descifrar
  try { const v = decryptPass(enc); return typeof v === 'string' && v.length > 0; }
  catch (_) { return false; }
}

(async () => {
  const db = await getDb();
  try {
    console.log('=== user_mgmt_ips (IP de gestión por usuario) ===');
    console.table(await db.all(
      `SELECT umi.workspace_id, umi.user_id, umi.mgmt_ip, umi.source
         FROM user_mgmt_ips umi ORDER BY umi.mgmt_ip`
    ));

    console.log('\n=== workspace_scan_ip (scan-IP del VPS por workspace) ===');
    console.table(await db.all(
      `SELECT wsi.workspace_id, wsi.scan_ip, w.name AS workspace_name
         FROM workspace_scan_ip wsi
         LEFT JOIN workspaces w ON w.id = wsi.workspace_id
        ORDER BY wsi.scan_ip`
    ));

    console.log('\n=== sesiones de túnel ACTIVE ===');
    console.table(await db.all(
      `SELECT workspace_id, user_id, vrf_name, mgmt_ip, expires_at
         FROM tunnel_user_sessions WHERE status = 'ACTIVE'`
    ).catch(() => []));

    console.log('\n=== app_settings MT_* (presencia + salud de cifrado, SIN valores) ===');
    const mt = await db.all("SELECT `key`, value FROM app_settings WHERE `key` LIKE 'MT_%'");
    console.table(mt.map(r => ({
      key: r.key,
      present: !!r.value,
      // Solo MT_PASS está cifrado; el resto son texto (ip/usuario).
      decrypt_ok: r.key === 'MT_PASS' ? decryptOk(r.value) : 'n/a',
    })));
  } catch (e) {
    console.error('ERR', e.message);
  }
  process.exit(0);
})();
