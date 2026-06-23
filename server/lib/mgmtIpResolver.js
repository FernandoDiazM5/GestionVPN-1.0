// ============================================================
//  mgmtIpResolver.js — resuelve la IP de gestión (WireGuard) de un usuario
//  leyéndola de los peers VIVOS del router, para auto-curar el mapeo
//  user_mgmt_ips cuando falta (peer creado a mano, usuario legacy/migrado).
//
//  ⚠️ Server-side y validado por PERTENENCIA (anti-spoofing — §4.3/§4.5):
//     la IP candidata NUNCA viene del body, solo del router + la atribución
//     en BD. Espeja la lógica de ownership de /tunnel/register-my-ip:
//       • platform_admin → peers en la iface ADMIN (su plano; §4.19). El único
//         con salida a internet (§4.10); es el documentado para el admin.
//       • OWNER / MEMBER → el peer cuya public-key === su member_wireguard
//         (la fuente que crea el mapeo al provisionar/aceptar). Así el moderador
//         resuelve SU peer, no los de sus members (que también cuelgan del
//         workspace en mgmt_peer_owners).
//
//  Devuelve un array de candidatos [{ ip, publicKey }] (0..n). NO lanza por
//  "no encontrado" (devuelve []); sí propaga errores de router (caída/cuelgue)
//  para que el llamador los clasifique como 503.
// ============================================================

const { connectToMikrotik, safeWrite } = require('../routeros.service');
const memberWgRepo = require('../db/repos/memberWgRepo');
const mgmtNet = require('./mgmtNet');
const { IPV4_REGEX } = require('../ubiquiti.service');

const ipsOfPeer = (peer) => (peer['allowed-address'] || '')
  .split(',')
  .map((a) => a.split('/')[0].trim())
  .filter((a) => IPV4_REGEX.test(a));

/**
 * @param {object} args
 * @param {object} args.account            — { sub, workspace_id, role, platform_admin }
 * @param {{ip,user,pass}} args.mikrotik
 * @returns {Promise<{ip:string, publicKey:string|null}[]>}
 */
async function resolveOwnedMgmtIps({ account, mikrotik }) {
  const { ip, user, pass } = mikrotik;
  let api;
  try {
    api = await connectToMikrotik(ip, user, pass);
    const peers = await safeWrite(api, ['/interface/wireguard/peers/print']);
    await api.close().catch(() => {});
    api = null;

    const out = [];

    if (account.platform_admin) {
      // Admin: SOLO su plano ADMIN (10.14.250.x). No caemos a CLIENTES para no
      // mapear por error una IP sin internet (§4.10).
      for (const p of peers || []) {
        if (p.interface !== mgmtNet.admin.iface) continue;
        for (const a of ipsOfPeer(p)) out.push({ ip: a, publicKey: p['public-key'] || null });
      }
      return out;
    }

    // OWNER / MEMBER: su propio peer = el de su member_wireguard (misma fuente que
    // crea el mapeo en la provisión). Si lo creó a mano y no hay fila, devolvemos
    // [] y el llamador mantiene el 409 (no adivinamos).
    const myWg = await memberWgRepo.getByUser(account.workspace_id, account.sub);
    if (!myWg?.public_key) return out;
    for (const p of peers || []) {
      if (!mgmtNet.userIfaces.includes(p.interface)) continue;
      if (p['public-key'] !== myWg.public_key) continue;
      for (const a of ipsOfPeer(p)) out.push({ ip: a, publicKey: p['public-key'] });
    }
    return out;
  } catch (e) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    throw e;
  }
}

module.exports = { resolveOwnedMgmtIps };
