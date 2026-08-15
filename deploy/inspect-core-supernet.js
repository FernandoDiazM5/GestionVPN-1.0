(async () => {
  const db = require('/repo/server/db.service');
  await db.initDb();
  const mgmtNet = require('/repo/server/lib/mgmtNet');
  mgmtNet.configureSupernet(await db.getAppSetting('management_supernet'));
  const service = require('/repo/server/lib/coreServerService');
  if (process.env.MODE === 'adopt-vps-key') {
    const { connectToMikrotik } = require('/repo/server/routeros.service');
    const creds = await service.loadCoreCredentials();
    const api = await connectToMikrotik(creds.ip, creds.user, creds.pass);
    try {
      const inventory = await service.readInventory(api);
      const peer = (inventory.peers || []).find(item =>
        item.interface === mgmtNet.vps.iface || item.comment === 'VPS');
      const publicKey = String(peer?.['public-key'] || '').trim();
      if (!/^[A-Za-z0-9+/]{43}=$/.test(publicKey)) throw new Error('No se encontró una clave pública válida del peer VPS');
      await db.setAppSetting('core_vps_public_key', publicKey);
      const { query } = require('/repo/server/db/mysql');
      const crypto = require('crypto');
      const admins = await query('SELECT id FROM users WHERE deleted_at IS NULL AND is_platform_admin=1 ORDER BY created_at LIMIT 1');
      if (admins[0]?.id) await query(`INSERT INTO platform_security_audit
        (id,actor_user_id,action,target,jail,category,reason,outcome,detail,request_ip,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
        crypto.randomUUID(), admins[0].id, 'CORE_VPS_KEY_ADOPTED', mgmtNet.vps.iface, null,
        'NETWORK_CONFIG', 'Adopción de la clave pública del peer VPS existente', 'SUCCESS',
        JSON.stringify({ interface: mgmtNet.vps.iface }), '127.0.0.1', Date.now(),
      ]);
    } finally { try { await api.close(); } catch (_) { /* noop */ } }
    console.log(JSON.stringify({ adopted: true, interface: mgmtNet.vps.iface }));
    process.exit(0);
  }
  const result = process.env.MODE === 'preview'
    ? await service.previewProvision()
    : await service.inspectCore();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})().catch(error => {
  console.error(error.code || error.message);
  process.exit(1);
});
