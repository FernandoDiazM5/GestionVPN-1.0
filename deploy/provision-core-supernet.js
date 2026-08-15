(async () => {
  const db = require('/repo/server/db.service');
  await db.initDb();
  const mgmtNet = require('/repo/server/lib/mgmtNet');
  mgmtNet.configureSupernet(await db.getAppSetting('management_supernet'));
  const service = require('/repo/server/lib/coreServerService');

  const preview = await service.previewProvision();
  if (!preview.canProvision || preview.blockers?.length) {
    console.error(JSON.stringify({ provisioned: false, blockers: preview.blockers || [] }));
    process.exit(2);
  }

  const result = await service.provisionCore();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
})().catch(error => {
  console.error(error.code || error.message);
  process.exit(1);
});
