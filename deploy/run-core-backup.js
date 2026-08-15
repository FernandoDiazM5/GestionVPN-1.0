(async () => {
  const db = require('/repo/server/db.service');
  await db.initDb();
  const result = await require('/repo/server/lib/coreBackupService').runCoreBackup('manual');
  console.log(JSON.stringify(result));
  process.exit(0);
})().catch(error => {
  console.error(error.code || error.message);
  process.exit(1);
});
