// ============================================================
//  settings.routes.js — settings de plataforma (router core)
//  Fase F5.A: shape uniforme (sendOk/AppError) + validación Zod.
// ============================================================
const express = require('express');
const router = express.Router();

const { getDb, encryptPass, getAppSetting } = require('../db.service');
const { sendOk, AppError, asyncHandler } = require('../lib/apiResponse');
const {
  SaveSettingRequestSchema, CORE_ROUTER_KEYS,
  CoreRouterValidateRequestSchema, CoreRouterBootstrapRequestSchema,
} = require('@gestionvpn/contracts');
const wgDetect = require('../lib/wgDetect');
const mgmtNet = require('../lib/mgmtNet');
const { connectToMikrotik, getErrorMessage } = require('../routeros.service');
const coreBootstrap = require('../lib/coreBootstrap');
const log = require('../lib/logger').child({ scope: 'settings:core-router' });

// CORE_ROUTER_KEYS: las claves del router core (MT_IP, MT_USER, MT_PASS) viven
// en @gestionvpn/contracts. Son infraestructura de plataforma: solo el
// Administrador (platform_admin) puede verlas/editarlas. El resto de claves
// (server_public_ip, wg_endpoint_ip, etc.) son operativas para moderadores.

router.get('/settings/get', asyncHandler(async (req, res) => {
  const db = await getDb();
  const isPlatformAdmin = !!req.account?.platform_admin;
  const rows = await db.all('SELECT `key`, value FROM app_settings');
  const settings = {};
  rows.forEach(r => {
    if (!isPlatformAdmin && CORE_ROUTER_KEYS.includes(r.key)) return;
    if (r.key === 'MT_PASS' && r.value) {
      settings[r.key] = '********';
    } else {
      settings[r.key] = r.value;
    }
  });
  return sendOk(res, { settings });
}));

// Solo el Administrador de PLATAFORMA puede escribir settings globales.
// ⚠️ Antes miraba el rol legacy `admin`, pero `mapRbacRole` se lo otorga también
// a OWNER → un moderador podía mutar settings GLOBALES del sistema
// (scan_mode, server_public_ip, local_scan_ip) por API, fuera de su tenant.
// Estos settings son plataforma-global: el gate correcto es `platform_admin`.
const requireAdmin = (req, _res, next) => {
  if (!req.account?.platform_admin) {
    return next(new AppError('Acceso denegado — solo el Administrador de plataforma.', 403, 'FORBIDDEN'));
  }
  next();
};

// Chequeo READ-ONLY (solo admin): ¿la local_scan_ip configurada está viva en
// este equipo? Solo relevante en modo 'local'. Alimenta la alerta de la UI sin
// modificar nada. `ok=true` cuando no aplica (modo VPS) o la IP sí está activa.
router.get('/settings/scan-local-check', requireAdmin, asyncHandler(async (req, res) => {
  const db = await getDb();
  const modeRow = await db.get("SELECT value FROM app_settings WHERE `key` = 'scan_mode'");
  const ipRow = await db.get("SELECT value FROM app_settings WHERE `key` = 'local_scan_ip'");
  const mode = modeRow?.value || 'vps';
  const configured = (ipRow?.value || '').trim();
  const candidates = wgDetect.listLocalMgmtIps();
  const ok = mode !== 'local' ? true : (!!configured && wgDetect.isLocalIpv4(configured));
  return sendOk(res, { mode, configured, ok, candidates });
}));

router.post('/settings/save', requireAdmin, asyncHandler(async (req, res) => {
  const { key, value } = SaveSettingRequestSchema.parse(req.body);

  if (CORE_ROUTER_KEYS.includes(key) && !req.account?.platform_admin) {
    throw new AppError('Solo el Administrador puede modificar la configuración del router core.', 403, 'FORBIDDEN');
  }

  const db = await getDb();
  let finalValue = value ?? '';

  if (key === 'MT_PASS') {
    if (finalValue === '********') return sendOk(res);
    if (finalValue) finalValue = encryptPass(String(finalValue));
  }

  await db.run(
    'INSERT INTO app_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, finalValue, Date.now()]
  );
  return sendOk(res);
}));

// ============================================================
//  Bootstrap del Router Core (Servidor VPN) — solo platform_admin.
//  Levanta cualquier RouterOS/CHR en blanco con la config base del Core.
//  Ver lib/coreBootstrap.js (lógica idempotente + anti-bloqueo §4.18).
// ============================================================

/** ¿Conectamos por el plano de gestión 10.x? (origen ya en trusted). */
const connectingViaMgmt = (host) =>
  mgmtNet.isMgmtIp(host) || mgmtNet.allNets.some(n => String(host).startsWith(n.split('/')[0].split('.').slice(0, 3).join('.')));

/** Persiste las credenciales del Core SOLO tras un bootstrap/validación OK. */
async function saveCoreCreds({ host, user, pass, publicIp, sstpPort }) {
  const db = await getDb();
  const now = Date.now();
  const put = (key, value) => db.run(
    'INSERT INTO app_settings (`key`, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(`key`) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, now]
  );
  await put('MT_IP', host);
  await put('MT_USER', user);
  await put('MT_PASS', encryptPass(String(pass)));
  // server_public_ip = endpoint que marcan los CPEs. Solo lo PRE-RELLENAMOS si
  // está vacío (la IP con la que conectamos es un buen default) — nunca pisamos
  // lo que el operador ya configuró para su IP pública/WAN.
  const curPublic = await getAppSetting('server_public_ip').catch(() => '');
  if (!curPublic && publicIp) await put('server_public_ip', publicIp);
  const curPort = await getAppSetting('sstp_port').catch(() => '');
  if (!curPort && sstpPort) await put('sstp_port', String(sstpPort));
}

// POST /settings/core-router/validate — conecta con creds del body (sin guardar),
// clasifica el estado del equipo y devuelve los valores vivos.
router.post('/settings/core-router/validate', requireAdmin, asyncHandler(async (req, res) => {
  const { publicIp, user, pass, connectIp } = CoreRouterValidateRequestSchema.parse(req.body);
  const host = (connectIp && connectIp.trim()) || publicIp;
  let api;
  try {
    api = await connectToMikrotik(host, user, pass);
    const { state, summary } = await coreBootstrap.readRouterState(api);
    await api.close();
    const currentMtIp = (await getAppSetting('MT_IP').catch(() => null)) || null;
    const isDifferentDevice = !!currentMtIp && currentMtIp !== host && currentMtIp !== publicIp;
    return sendOk(res, { reachable: true, state, isDifferentDevice, currentMtIp, summary });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    // 400 (no 503) para que el error se muestre INLINE en el asistente y no
    // dispare el overlay global "router de gestión no disponible".
    throw new AppError(getErrorMessage(error, host, user), 400, 'CORE_VALIDATE_FAILED');
  }
}));

// POST /settings/core-router/bootstrap — aplica la config base idempotente y,
// SOLO al terminar OK, persiste las credenciales del Core.
router.post('/settings/core-router/bootstrap', requireAdmin, asyncHandler(async (req, res) => {
  const { publicIp, user, pass, connectIp, confirmSwitch, trustedNets } = CoreRouterBootstrapRequestSchema.parse(req.body);
  const host = (connectIp && connectIp.trim()) || publicIp;

  // ¿Ya hay OTRO router configurado? → exigir confirmación explícita (§ "cambiar equipo").
  const currentMtIp = (await getAppSetting('MT_IP').catch(() => null)) || null;
  if (currentMtIp && currentMtIp !== host && currentMtIp !== publicIp && !confirmSwitch) {
    throw new AppError(
      `Ya hay un Servidor VPN configurado en ${currentMtIp}. Confirma el cambio a ${host}.`,
      409, 'CORE_DEVICE_CHANGE', { currentMtIp }
    );
  }

  const steps = [];
  const pushStep = (s) => { steps[steps.length] = s; };
  let api;
  try {
    api = await connectToMikrotik(host, user, pass);

    // Anti-bloqueo (§4.18): el "drop WAN" y la restricción de la API solo se
    // aplican si el origen del backend está garantizado en trusted.
    const backendOrigin = await coreBootstrap.detectBackendOrigin(api);
    const lockdownSafe = connectingViaMgmt(host) || !!backendOrigin;
    const sstpPort = parseInt((await getAppSetting('sstp_port').catch(() => '')) || '4443', 10) || 4443;

    // NO gestionamos la IP pública/WAN: eso lo provee la nube o lo habilita el
    // operador. Solo montamos el andamiaje VPN del Core.
    // Redes de gestión extra de confianza (ej. la LAN local del admin) → entran a
    // LIST-MGMT-TRUSTED y a la allowlist de la API para que el blindado no bloquee.
    await coreBootstrap.applyBaseline(api,
      { sstpPort, backendOrigin, trustedPublics: trustedNets || [], lockdownSafe }, pushStep);

    const { state, summary } = await coreBootstrap.readRouterState(api);
    await api.close();

    await saveCoreCreds({ host, user, pass, publicIp, sstpPort });

    const created = steps.filter(s => s.status === 'ok').length;
    const skipped = steps.filter(s => s.status === 'skip').length;
    log.info({ host, state, created, skipped, lockdownSafe }, 'Core router bootstrap completado');
    return sendOk(res, {
      message: `Servidor VPN preparado — ${created} aplicados, ${skipped} ya presentes`,
      state, steps, created, skipped, summary,
    });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw new AppError(getErrorMessage(error, host, user), 500, 'MIKROTIK_ERROR',
      { steps, failedAt: steps.length + 1 });
  }
}));

// GET /settings/core-router/status — usa las creds guardadas; para el panel
// "todo conforme" cuando el servidor ya está trabajando.
router.get('/settings/core-router/status', requireAdmin, asyncHandler(async (req, res) => {
  const mt = req.mikrotik;
  if (!mt) return sendOk(res, { configured: false, reachable: false, state: null, mtIp: null, summary: null });
  let api;
  try {
    api = await connectToMikrotik(mt.ip, mt.user, mt.pass);
    const { state, summary } = await coreBootstrap.readRouterState(api);
    await api.close();
    return sendOk(res, { configured: true, reachable: true, state, mtIp: mt.ip, summary });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    return sendOk(res, {
      configured: true, reachable: false, state: null, mtIp: mt.ip, summary: null,
      message: getErrorMessage(error, mt.ip, mt.user),
    });
  }
}));

module.exports = router;
