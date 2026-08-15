'use strict';

const mgmtNet = require('../lib/mgmtNet');
const { withTransaction, closePool } = require('./mysql');

async function main(options = {}) {
  const cidr = String(options.cidr ?? process.env.INITIAL_MANAGEMENT_SUPERNET ?? '').trim();
  if (!cidr) return { skipped:true };
  const plan = mgmtNet.deriveSupernet(cidr);
  if (!plan) throw Object.assign(new Error('INITIAL_MANAGEMENT_SUPERNET_INVALID'), { code:'INITIAL_MANAGEMENT_SUPERNET_INVALID' });
  const result = await (options.transaction || withTransaction)(async tx => {
    const rows = await tx.query("SELECT `key`,value FROM app_settings WHERE `key` IN ('management_supernet','core_provisioned_at') FOR UPDATE");
    const values = Object.fromEntries(rows.map(row=>[row.key,row.value]));
    const nodes = await tx.query('SELECT id FROM nodes LIMIT 1 FOR UPDATE');
    if (values.management_supernet) {
      const existingPlan=mgmtNet.deriveSupernet(values.management_supernet);
      if (!existingPlan) throw Object.assign(new Error('EXISTING_MANAGEMENT_SUPERNET_INVALID'), {code:'EXISTING_MANAGEMENT_SUPERNET_INVALID'});
      return { plan:existingPlan, unchanged:true, preserved:true };
    }
    if (values.core_provisioned_at || nodes.length) throw Object.assign(new Error('GREENFIELD_NETWORK_ALREADY_LOCKED'), {code:'GREENFIELD_NETWORK_ALREADY_LOCKED'});
    const now=Date.now();
    await tx.query('INSERT INTO app_settings (`key`,value,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_at=VALUES(updated_at)', ['management_supernet',plan.net,now]);
    await tx.query('INSERT INTO app_settings (`key`,value,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_at=VALUES(updated_at)', ['management_supernet_source','CENTRAL_ACTIVATION_RECOMMENDATION',now]);
    return { plan, unchanged:false };
  });
  mgmtNet.configureSupernet(plan.net);
  return result;
}

if (require.main === module) main()
  .then(result => { process.stdout.write(`[greenfield] management_supernet ${result.skipped ? 'omitido' : 'preconfigurado'}\n`); })
  .catch(error => { process.stderr.write(`[greenfield] ERROR ${error.code || error.message}\n`); process.exitCode=1; })
  .finally(()=>closePool());

module.exports = { main };
