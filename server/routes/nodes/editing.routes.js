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
  connectToMikrotik, safeWrite, getErrorMessage,
} = require('../../routeros.service');
const { IPV4_REGEX } = require('../../ubiquiti.service');
const { getDb, updateNodeFields } = require('../../db.service');
const { nodeBelongsToRequester, requireOperator } = require('./_shared');
const { sendOk, AppError, asyncHandler } = require('../../lib/apiResponse');
const { requireMikrotik } = require('../../lib/routeGuards');
const { validate } = require('../../middleware/validate');
const { NodeEditRequestSchema, NodeLabelRequestSchema } = require('@gestionvpn/contracts');
const { cidrOverlaps, normalizeCidrs } = require('../../lib/ipv4Cidr');
const mgmtNet = require('../../lib/mgmtNet');
const scanIpRepo = require('../../db/repos/scanIpRepo');
const { ensureTowerEntries, ensureRoute, removeRoutesForVrf } = require('../../lib/remoteNetworkSync');
const { enqueueWg0Intent } = require('../../lib/wg0Intent');
const { syncPeerLanAddresses } = require('../../lib/wireguardPeerLanSync');

router.post('/node/edit', requireOperator, validate({ body: NodeEditRequestSchema }), asyncHandler(async (req, res) => {
  const { ip, user, pass } = requireMikrotik(req);
  const { pppUser, newPppUser, newPassword, newRemoteAddress, newComment, vrfName, addSubnets, removeSubnets } = req.body;
  if (!pppUser) throw new AppError('pppUser requerido', 400, 'VALIDATION_ERROR');
  if (!(await nodeBelongsToRequester(req, pppUser))) {
    throw new AppError('Nodo no encontrado en tu workspace', 404, 'NOT_FOUND');
  }
  const db = await getDb();
  const nodeRow = await db.get('SELECT * FROM nodes WHERE ppp_user = ?', [pppUser]);
  if (!nodeRow) throw new AppError('Nodo no encontrado', 404, 'NOT_FOUND');
  let storedSubnets = [];
  try {
    const parsed = JSON.parse(nodeRow.lan_subnets || '[]');
    if (Array.isArray(parsed)) storedSubnets = parsed;
  } catch (error) {
    log.warn({ pppUser, err: error.message }, 'lan_subnets malformado; se usará segmento_lan');
  }
  if (storedSubnets.length === 0 && nodeRow.segmento_lan) storedSubnets = [nodeRow.segmento_lan];
  const currentSubnets = normalizeCidrs(storedSubnets, { allowHost: false });
  const normalizedAdds = normalizeCidrs(addSubnets, { allowHost: false });
  const normalizedRemovals = normalizeCidrs(removeSubnets, { allowHost: false });
  const protectedNets = [...mgmtNet.allNets, scanIpRepo.poolSubnet(), '10.10.250.0/24', '10.10.251.0/24'];
  const protectedConflict = normalizedAdds.find((subnet) => protectedNets.some((network) => cidrOverlaps(subnet, network)));
  if (protectedConflict)
    throw new AppError(`La red ${protectedConflict} se solapa con una red reservada de gestión`, 400, 'VALIDATION_ERROR');
  const isWG = pppUser.startsWith('WG-ND') || pppUser.startsWith('VPN-WG-');
  const hasVrf = !!vrfName;
  const ifaceName = isWG ? pppUser : (hasVrf ? vrfName.replace(/^VRF-/, 'VPN-SSTP-') : '');
  const ndMatch = vrfName?.match(/ND(\d+)/);
  const ndComment = ndMatch ? `ND${ndMatch[1]}` : (vrfName || '');
  const nameMatch = vrfName?.match(/VRF-ND\d+-(.+)/);
  const nameUpper = nameMatch ? nameMatch[1] : '';

  const steps = []; let api; let resolvedWgPublicKey = '';
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
    if (normalizedRemovals.length > 0 && hasVrf) {
      await removeRoutesForVrf(api, vrfName, normalizedRemovals);
      for (const subnet of normalizedRemovals) {
        steps.push({ step: 'rm', obj: 'Eliminar subred', name: subnet, status: 'ok' });
      }
    }

    // Agregar subnets
    if (normalizedAdds.length > 0 && hasVrf) {
      await ensureTowerEntries(api, normalizedAdds, `LAN ${nameUpper}`);
      for (const subnet of normalizedAdds) {
        await ensureRoute(api, { dst: subnet, gateway: `${ifaceName}@${vrfName}`,
          routingTable: vrfName, comment: `Route-${ndComment}` });
        steps.push({ step: 'add', obj: 'Agregar subred', name: subnet, status: 'ok' });
      }
    }

    // Para WireGuard, si cambiaron las subredes, hay que actualizar el allowed-address del Peer
    let updatedLanSubnets = null;
    if (hasVrf && (normalizedRemovals.length > 0 || normalizedAdds.length > 0)) {
      let wgPeerIp = '';
      let wgPubKey = '';
      if (nodeRow) {
        if (nodeRow.ip_tunnel) {
          // Modelo unificado: ip_tunnel = IP única del nodo → /32 directo.
          // Compat: legacy /30 en 10.10.251.x → deriva el .X+2 del bloque.
          const legacyMatch = nodeRow.ip_tunnel.match(/10\.10\.251\.(\d+)/);
          wgPeerIp = legacyMatch
            ? `10.10.251.${Math.floor(parseInt(legacyMatch[1]) / 4) * 4 + 2}/32`
            : `${nodeRow.ip_tunnel.split('/')[0]}/32`;
        }
        wgPubKey = nodeRow.wg_public_key || '';
      }

      // Computar nueva lista de subredes
      const newSubnets = new Set(currentSubnets);
      normalizedRemovals.forEach(s => newSubnets.delete(s));
      normalizedAdds.forEach(s => newSubnets.add(s));
      updatedLanSubnets = Array.from(newSubnets);

      // Los nodos históricos pueden no tener wg_public_key persistida. Solo se
      // usa el fallback por interfaz cuando allí existe exactamente un peer.
      if (isWG) {
        const peerSync = await syncPeerLanAddresses(api, {
          interfaceName: ifaceName,
          publicKey: wgPubKey,
          peerAddress: wgPeerIp,
          lanSubnets: updatedLanSubnets,
        });
        resolvedWgPublicKey = peerSync.publicKey;
        steps.push({
          step: 'wg-peer', obj: 'WG Peer',
          name: peerSync.changed ? 'allowed-address actualizado y verificado' : 'allowed-address ya sincronizado',
          status: 'ok',
        });
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
      if (!nodeRow.wg_public_key && resolvedWgPublicKey) updates.wg_public_key = resolvedWgPublicKey;
      // También al renombrar se actualiza la misma fila para conservar AP/CPE.
      await updateNodeFields(pppUser, updates);
      if (updatedLanSubnets !== null) enqueueWg0Intent(updatedLanSubnets, 'node-edit');
      log.debug({ pppUser: effectiveUser }, 'DB: nodo actualizado en MySQL');
    } catch (dbErr) {
      log.error({ err: dbErr.message }, 'DB: actualizar nodo en MySQL');
      throw new AppError(
        'El router cambió, pero no se pudo guardar el nodo. La reconciliación requiere atención.',
        500, 'NODE_EDIT_PARTIAL_FAILURE', { steps, retryable: true }
      );
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

router.post('/node/label/save', requireOperator, validate({ body: NodeLabelRequestSchema }), asyncHandler(async (req, res) => {
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
