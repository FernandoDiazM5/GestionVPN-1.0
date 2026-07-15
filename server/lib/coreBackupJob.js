const { loadConfig, localDateParts, cleanupLocalArtifacts, runCoreBackup } = require('./coreBackupService');
const log = require('./logger').child({ scope: 'core-backup-job' });

let timer = null;
let startupTimer = null;
let running = false;

async function runDueBackup() {
  if (running) return;
  running = true;
  try {
    const config = await loadConfig();
    if (!config.enabled) return;
    const local = localDateParts(new Date(), config.timeZone);
    if (local.time < config.time) return;
    const result = await runCoreBackup('scheduled');
    if (result?.sent) log.info({ filenames: result.filenames }, 'Respaldo diario del core enviado');
  } catch (error) {
    log.warn({ code: error.code || 'BACKUP_JOB_FAILED' }, 'El respaldo diario del core no pudo completarse');
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  cleanupLocalArtifacts().catch(() => {});
  startupTimer = setTimeout(() => { void runDueBackup(); }, 15_000);
  timer = setInterval(() => { void runDueBackup(); }, 60_000);
  log.info('Programador de respaldo diario del core iniciado');
}

function stop() {
  if (startupTimer) clearTimeout(startupTimer);
  if (timer) clearInterval(timer);
  startupTimer = null;
  timer = null;
}

module.exports = { start, stop, runDueBackup };
