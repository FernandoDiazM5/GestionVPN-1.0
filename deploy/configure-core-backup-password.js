(async () => {
  const crypto = require('crypto');
  const db = require('/repo/server/db.service');
  await db.initDb();

  const existing = await db.getAppSetting('core_backup_password');
  if (existing) {
    console.log(JSON.stringify({ configured: true, changed: false }));
    process.exit(0);
  }

  const secret = crypto.randomBytes(24).toString('base64url');
  await db.setAppSetting('core_backup_password', db.encryptPass(secret));
  console.log(JSON.stringify({ configured: true, changed: true, length: secret.length }));
  process.exit(0);
})().catch(error => {
  console.error(error.code || error.message);
  process.exit(1);
});
