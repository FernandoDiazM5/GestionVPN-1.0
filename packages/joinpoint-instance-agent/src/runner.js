'use strict';

const { InstanceAgent } = require('./instanceAgent');

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function loadRunnerConfig() {
  const intervalSeconds = Number(process.env.JOINPOINT_SYNC_INTERVAL_SECONDS || 300);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 3600) throw new Error('JOINPOINT_SYNC_INTERVAL_INVALID');
  return { instanceId:required('JOINPOINT_INSTANCE_ID'), centralUrl:required('JOINPOINT_CENTRAL_URL'),
    privateKeyFile:required('JOINPOINT_INSTANCE_PRIVATE_KEY_FILE'), stateDirectory:required('JOINPOINT_AGENT_STATE_DIRECTORY'),
    softwareVersion:required('JOINPOINT_SOFTWARE_VERSION'), intervalSeconds };
}

async function main() {
  const config = loadRunnerConfig();
  const agent = new InstanceAgent(config);
  let stopped = false; let failures = 0; let timer;
  const stop = () => { stopped=true; if (timer) clearTimeout(timer); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const run = async () => {
    try {
      const state = await agent.heartbeat();
      failures = state.centralReachable ? 0 : Math.min(failures + 1, 4);
      process.stdout.write(`${JSON.stringify({ event:'joinpoint-heartbeat', at:new Date().toISOString(),
        centralReachable:state.centralReachable, commercialState:state.capabilities.commercialState })}\n`);
    } catch (error) {
      failures = Math.min(failures + 1, 4);
      process.stderr.write(`${JSON.stringify({ event:'joinpoint-heartbeat-error', at:new Date().toISOString(), code:error.code || 'AGENT_ERROR' })}\n`);
    }
    if (stopped) return;
    const base = Math.min(config.intervalSeconds * (2 ** failures), 3600);
    const jittered = Math.round(base * (0.9 + Math.random() * 0.2));
    timer = setTimeout(run, jittered * 1000);
  };
  await run();
}

if (require.main === module) main().catch(error => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode=1; });

module.exports = { loadRunnerConfig, main };
