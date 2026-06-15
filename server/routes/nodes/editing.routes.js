// ============================================================
//  routes/nodes/editing.routes.js — renombrado/edición de túneles
//
//   POST /node/edit         → cambia user/password/IP/comment/subnets
//   POST /node/label/save   → etiqueta MySQL (anula comment de MikroTik)
//
//  Fase F5.A: shape uniforme (sendOk/AppError) + Zod.
// ============================================================

const express = require('express');
const router = express.Router();

const log = require('../../lib/logger').child({ scope: 'nodes:editing' });
const {
  connectToMikrotik, safeWrite, getErrorMessage, writeIdempotent,
} = require('../../routeros.service');
const { IPV4_REGEX } = require('../../ubiquiti.service');
const { getDb, saveNode, deleteNode } = require('../../db.service');
const { nodeBelongsToRequester, requireOperator } = require('./_shared');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');
const { requireMikrotik } = require('../../lib/routeGuards');

router.post('/node/edit', requireOperator, asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { pppUser, newPppUser, newPassword, newRemoteAddress, newComment, vrfName, addSubnets, removeSubnets } = req.body;
  if (!pppUser) throw new AppError('pppUser requerido', 400, 'VALIDATION_ERROR');
  if (!(await nodeBelongsToRequester(req, pppUser))) {
    throw new AppError('Nodo no encontrado en tu workspace', 404, 'NOT_FOUND');
  }
  const isWG = pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-');
  const hasVrf = !!vrfName;
  const ifaceName = isWG ? pppUser : (hasVrf ? vrfName.replace(/^VRF-/, 'VPN-SSTP-') : '');
  const ndMatch = vrfName?.match(/ND(\d+)/);
  const ndComment = ndMatch ? `ND${ndMatch[1]}` : (vrfName || '');
  const nameMatch = vrfName?.match(/VRF-ND\d+-(.+)/);
  const nameUpper = nameMatch ? nameMatch[1] : '';

  const steps = []; let api;
  try {
    api = await connectToMikrotik(ip, user, pass);

    if (!isWG) {
      // Cambios en el PPP Secret (user, password, remote-address, comment) — solo SSTP
      const secretChanges = [];
      if (newPassword) secretChanges.push(`=password=${newPassword}`);
      if (newRemoteAddress && IPV4_REGEX.test(newRemoteAddress)) secretChanges.push(`=remote-address=${newRemoteAddress}`);
      if (newPppUser && newPppUser !== pppUser) secretChanges.push(`=name=${newPppUser}`);
      if (newComment !== undefined && newComment !== null) secretChanges.push(`=comment=${newComment}`);

      if (secretChanges.length > 0) {
        const secrets = await safeWrite(api, ['/ppp/secret/print']);
        const secret = secrets.find(s => s.name === pppUser);
        if (secret) await safeWrite(api, ['/ppp/secret/set', `=.id=${secret['.id']}`, ...secretChanges]);

        const desc = [
          newPppUser && newPppUser !== pppUser ? `usuario: ${pppUser}→${newPppUser}` : null,
          newPassword ? 'contraseña actualizada' : null,
          newRemoteAddress ? `IP túnel: ${newRemoteAddress}` : null,
          newComment !== undefined && newComment !== null ? `etiqueta: ${newComment}` : null,
        ].filter(Boolean).join(', ');
        steps.push({ step: 1, obj: 'PPP Secret', name: desc, status: 'ok' });
      }

      // Si cambió el usuario PPP, también actualizar el binding SSTP
      if (newPppUser && newPppUser !== pppUser && hasVrf) {
        const ifaces = await safeWrite(api, ['/interface/sstp-server/print']);
        const iface = ifaces.find(i => i.name === ifaceName);
        if (iface) await safeWrite(api, ['/interface/sstp-server/set', `=.id=${iface['.id']}`, `=user=${newPppUser}`]);
        steps.push({ step: 2, obj: 'SSTP Interface (binding usuario)', name: `${ifaceName} → ${newPppUser}`, status: 'ok' });
      }
    }

    // Para WG: actualizar comment/etiqueta directamente en la interfaz WG
    if (isWG && newComment !== undefined && newComment !== null) {
      const wgIfaces = await safeWrite(api, ['/interface/wireguard/print']).catch(() => []);
      const wgIface = wgIfaces.find(i => i.name === ifaceName);
      if (wgIface) await safeWrite(api, ['/interface/wireguard/set', `=.id=${wgIface['.id']}`, `=comment=${newComment}`]);
      steps.push({ step: 1, obj: 'WG Interface (etiqueta)', name: newComment, status: 'ok' });
    }

    // Actualizar label en MySQL (ambos protocolos)
    if (newComment !== undefined && newComment !== null) {
      try {
        const db = await getDb();
        await db.run('UPDATE nodes SET label = ? WHERE ppp_user = ?', [newComment, pppUser]);
      } catch (e) {
        log.error({ err: e.message }, 'DB: merge labels durante edit');
      }
    }

    // Eliminar subnets
    if (Array.isArray(removeSubnets) && removeSubnets.length > 0 && hasVrf) {
      // SECUENCIAL — RouterOS no soporta comandos paralelos en la misma conexión
      const addrList = await safeWrite(api, ['/ip/firewall/address-list/print']);
      const routes   = await safeWrite(api, ['/ip/route/print']);
      for (const subnet of removeSubnets) {
        const entry = addrList.find(a => a.list === 'LIST-NET-REMOTE-TOWERS' && a.address === subnet);
        if (entry) await safeWrite(api, ['/ip/firewall/address-list/remove', `=.id=${entry['.id']}`]);
        const route = routes.find(r => r['routing-table'] === vrfName && r['dst-address'] === subnet);
        if (route) await safeWrite(api, ['/ip/route/remove', `=.id=${route['.id']}`]);
        steps.push({ step: 'rm', obj: 'Eliminar subred', name: subnet, status: 'ok' });
      }
    }

    // Agregar subnets
    if (Array.isArray(addSubnets) && addSubnets.length > 0 && hasVrf) {
      for (const subnet of addSubnets) {
        await writeIdempotent(api, ['/ip/firewall/address-list/add',
          '=list=LIST-NET-REMOTE-TOWERS', `=address=${subnet}`, `=comment=LAN ${nameUpper}`]);
        await writeIdempotent(api, ['/ip/route/add',
          `=dst-address=${subnet}`, `=gateway=${ifaceName}@${vrfName}`,
          `=routing-table=${vrfName}`, '=scope=30', '=target-scope=10', `=comment=Route-${ndComment}`]);
        steps.push({ step: 'add', obj: 'Agregar subred', name: subnet, status: 'ok' });
      }
    }

    // Para WireGuard, si cambiaron las subredes, hay que actualizar el allowed-address del Peer
    let updatedLanSubnets = null;
    if (hasVrf && ((Array.isArray(removeSubnets) && removeSubnets.length > 0) || (Array.isArray(addSubnets) && addSubnets.length > 0))) {
      const db = await getDb();
      const nodeRow = await db.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
      let currentSubnets = [];
      let wgPeerIp = '';
      let wgPubKey = '';
      if (nodeRow) {
        // segmento_lan stores the primary subnet; for multi-subnet, read routes from MikroTik
        currentSubnets = nodeRow.segmento_lan ? [nodeRow.segmento_lan] : [];
        if (nodeRow.ip_tunnel) {
          const match = nodeRow.ip_tunnel.match(/10\.10\.251\.(\d+)/);
          if (match) wgPeerIp = `10.10.251.${Math.floor(parseInt(match[1]) / 4) * 4 + 2}/32`;
        }
        wgPubKey = nodeRow.wg_public_key || '';
      }

      // Computar nueva lista de subredes
      const newSubnets = new Set(currentSubnets);
      (removeSubnets || []).forEach(s => newSubnets.delete(s));
      (addSubnets || []).forEach(s => newSubnets.add(s));
      updatedLanSubnets = Array.from(newSubnets);

      // Actualizar el peer de WireGuard si existe en MikroTik
      if (isWG && wgPubKey) {
        const wgPeers = await safeWrite(api, ['/interface/wireguard/peers/print']);
        const peer = wgPeers.find(p => p.interface === ifaceName && p['public-key'] === wgPubKey);
        if (peer) {
          const allowedIps = wgPeerIp ? `${wgPeerIp},${updatedLanSubnets.join(',')}` : updatedLanSubnets.join(',');
          await safeWrite(api, ['/interface/wireguard/peers/set', `=.id=${peer['.id']}`, `=allowed-address=${allowedIps}`]);
          steps.push({ step: 'wg-peer', obj: 'WG Peer', name: 'allowed-address actualizado', status: 'ok' });
        }
      }
    }

    await api.close();
    if (steps.length === 0) {
      // No es error — solo "nada que hacer". Devolvemos sendOk con flag.
      return sendOk(res, { noChanges: true, message: 'Sin cambios para aplicar', steps });
    }

    // --- Actualizar nodo en MySQL ---
    try {
      const effectiveUser = (newPppUser && newPppUser !== pppUser) ? newPppUser : pppUser;
      const updates = { ppp_user: effectiveUser };
      if (newComment !== undefined && newComment !== null) updates.nombre_nodo = newComment;
      if (newRemoteAddress) updates.ip_tunnel = newRemoteAddress;
      if (updatedLanSubnets !== null) {
        updates.lan_subnets = updatedLanSubnets;
        updates.segmento_lan = updatedLanSubnets[0] || '';
      }
      if (newPppUser && newPppUser !== pppUser) {
        // Usuario cambió: eliminar registro viejo y crear uno nuevo
        await deleteNode(pppUser);
      }
      await saveNode(updates);
      log.debug({ pppUser: effectiveUser }, 'DB: nodo actualizado en MySQL');
    } catch (dbErr) {
      log.error({ err: dbErr.message }, 'DB: actualizar nodo en MySQL');
    }

    return sendOk(res, { message: 'Nodo actualizado correctamente', steps });
  } catch (error) {
    if (api) try { await api.close(); } catch (_) { /* ignore */ }
    if (error instanceof AppError) throw error;
    throw new AppError(
      getErrorMessage(error, ip, user),
      500, 'MIKROTIK_ERROR',
      { steps, failedAt: steps.length + 1 }
    );
  }
}));

router.post('/node/label/save', requireOperator, asyncHandler(async (req, res) => {
  const { pppUser, label } = req.body;
  if (!pppUser) throw new AppError('pppUser requerido', 400, 'VALIDATION_ERROR');
  if (!(await nodeBelongsToRequester(req, pppUser))) {
    throw new AppError('Nodo no encontrado en tu workspace', 404, 'NOT_FOUND');
  }
  const db = await getDb();
  await db.run('UPDATE nodes SET label = ? WHERE ppp_user = ?', [label || '', pppUser]);
  return sendOk(res);
}));

module.exports = router;
