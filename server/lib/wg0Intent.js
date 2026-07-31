const fs = require('fs');
const path = require('path');
const { appendWg0Intent } = require('./wg0Sync');
const log = require('./logger').child({ scope: 'wg0-intent' });

const intentPath = process.env.WG0_INTENT_PATH || '/wg0sync/allowedips.desired';
const enabled = process.env.WG0_AUTOSYNC !== 'false';

function enqueueWg0Intent(subnets, context = 'network-change') {
  if (!enabled || !Array.isArray(subnets) || subnets.length === 0) return;
  setImmediate(() => {
    try {
      if (!fs.existsSync(path.dirname(intentPath))) return;
      const result = appendWg0Intent(intentPath, subnets);
      if (result.changed) log.info({ context, added: result.added }, 'intención wg0 actualizada');
      else log.debug({ context, total: subnets.length }, 'intención wg0 sin cambios');
    } catch (error) {
      log.error({ context, err: error.message, intentPath },
        'no se pudo registrar la intención wg0; la reconciliación periódica reintentará');
    }
  });
}

module.exports = { enqueueWg0Intent };
