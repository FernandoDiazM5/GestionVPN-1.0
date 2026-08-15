'use strict';

const fs = require('fs/promises');
const { InstanceAgent } = require('./instanceAgent');
const { loadRunnerConfig } = require('./runner');

async function readActivation(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error('JOINPOINT_ACTIVATION_RESPONSE_NOT_FILE');
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw new Error('JOINPOINT_ACTIVATION_RESPONSE_PERMISSIONS');
  let value;
  try { value = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (_) { throw new Error('JOINPOINT_ACTIVATION_RESPONSE_INVALID'); }
  const activation = value.activation || value;
  for (const field of ['instanceId', 'license', 'licensePublicKey']) {
    if (!String(activation[field] || '').trim()) throw new Error(`JOINPOINT_ACTIVATION_${field.toUpperCase()}_REQUIRED`);
  }
  return activation;
}

async function main() {
  const config = loadRunnerConfig();
  const file = String(process.env.JOINPOINT_ACTIVATION_RESPONSE_FILE || '').trim();
  if (!file) throw new Error('JOINPOINT_ACTIVATION_RESPONSE_FILE_REQUIRED');
  const activation = await readActivation(file);
  const state = await new InstanceAgent(config).bootstrap(activation);
  process.stdout.write(`${JSON.stringify({ event:'joinpoint-agent-bootstrapped', instanceId:state.instanceId,
    commercialState:state.capabilities.commercialState })}\n`);
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${error.code || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { readActivation, main };
