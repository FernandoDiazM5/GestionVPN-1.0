const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const INTENT_DIR = process.env.WG0_INTENT_DIR || '/wg0sync';
const INTENT_PATH = path.join(INTENT_DIR, 'server-config.desired.json');
const RESULT_PATH = path.join(INTENT_DIR, 'server-config.result.json');

async function atomicJsonWrite(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, target);
}

async function requestWireguardOperation(operation, desired, actorUserId) {
  const request = {
    version: 1,
    requestId: crypto.randomUUID(),
    operation,
    desired: operation === 'APPLY' ? desired : null,
    actorUserId: String(actorUserId || ''),
    requestedAt: Date.now(),
  };
  await atomicJsonWrite(INTENT_PATH, request);
  return { requestId: request.requestId, operation, status: 'QUEUED', requestedAt: request.requestedAt };
}

async function readWireguardAgentResult() {
  try {
    const parsed = JSON.parse(await fs.readFile(RESULT_PATH, 'utf8'));
    return {
      requestId: String(parsed.requestId || ''), operation: String(parsed.operation || ''),
      status: String(parsed.status || 'UNKNOWN'), message: String(parsed.message || ''),
      publicKey: /^[A-Za-z0-9+/]{43}=$/.test(String(parsed.publicKey || '')) ? parsed.publicKey : null,
      backupId: String(parsed.backupId || ''), completedAt: Number(parsed.completedAt || 0) || null,
    };
  } catch (_) { return null; }
}

module.exports = { requestWireguardOperation, readWireguardAgentResult, atomicJsonWrite, INTENT_PATH, RESULT_PATH };
