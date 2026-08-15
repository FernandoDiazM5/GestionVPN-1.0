'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

class AtomicStateStore {
  constructor(stateDirectory) {
    this.directory = path.resolve(stateDirectory);
    this.file = path.join(this.directory, 'agent-state.json');
  }

  async read() {
    const raw = await fs.readFile(this.file, 'utf8');
    return JSON.parse(raw);
  }

  async write(state) {
    await fs.mkdir(this.directory, { recursive:true, mode:0o700 });
    if (process.platform !== 'win32') await fs.chmod(this.directory, 0o700);
    const temporary = path.join(this.directory, `.agent-state-${crypto.randomUUID()}.tmp`);
    const handle = await fs.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(state)}\n`, { encoding:'utf8' });
      await handle.sync();
    } finally { await handle.close(); }
    try {
      await fs.rename(temporary, this.file);
      await fs.chmod(this.file, 0o600);
      const directory = await fs.open(this.directory, 'r');
      try { await directory.sync(); }
      catch (error) { if (!['EPERM', 'EINVAL', 'ENOTSUP'].includes(error.code)) throw error; }
      finally { await directory.close(); }
    } catch (error) {
      await fs.rm(temporary, { force:true }).catch(() => {});
      throw error;
    }
  }
}

module.exports = { AtomicStateStore };
