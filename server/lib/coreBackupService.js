const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client: SSHClient } = require('ssh2');
const { query } = require('../db/mysql');
const { getAppSetting, decryptPass } = require('../db.service');
const { connectToMikrotik, safeWrite, classifyError } = require('../routeros.service');
const { sendGeneric } = require('./mailer');
const mgmtNet = require('./mgmtNet');
const log = require('./logger').child({ scope: 'core-backup' });

const DEFAULT_TIMEZONE = 'America/Lima';
const DEFAULT_TIME = '02:00';
const PREFIX = 'servervpn_';
const TMP_PREFIX = 'gvpn-core-';
const MAX_BYTES = Number(process.env.CORE_BACKUP_MAX_BYTES || 15 * 1024 * 1024);

function sanitizeIdentity(value) {
  return String(value || 'MikroTik')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80) || 'MikroTik';
}

function localDateParts(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, item) => {
    if (item.type !== 'literal') acc[item.type] = item.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    timestamp: `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}`,
  };
}

function buildBackupStem(identity, date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  return `${PREFIX}${localDateParts(date, timeZone).timestamp}_${sanitizeIdentity(identity)}`;
}

function maskEmail(email) {
  const [name = '', domain = ''] = String(email || '').split('@');
  if (!domain) return '';
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

function validateRscContent(content) {
  const text = String(content || '');
  if (!text.trim() || !text.includes('#')) throw codedError('El export RSC está vacío o no es válido.', 'RSC_INVALID');
  const sensitive = /(?:password|private-key|preshared-key|secret)\s*=\s*(?:"(?!")[^"]+"|[^\s";][^\s;]*)/i;
  if (sensitive.test(text)) throw codedError('El export RSC contiene un secreto visible.', 'RSC_SENSITIVE');
  return true;
}

function codedError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function fileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function loadConfig() {
  const [ip, user, passEncrypted, backupEncrypted, enabled, time, timeZone] = await Promise.all([
    getAppSetting('MT_IP'), getAppSetting('MT_USER'), getAppSetting('MT_PASS'),
    getAppSetting('core_backup_password'), getAppSetting('core_backup_enabled'),
    getAppSetting('core_backup_time'), getAppSetting('core_backup_timezone'),
  ]);
  return {
    ip: String(ip || '').trim(), user: String(user || '').trim(),
    pass: passEncrypted ? decryptPass(passEncrypted) : '',
    backupPassword: backupEncrypted ? decryptPass(backupEncrypted) : '',
    enabled: String(enabled || 'false') === 'true',
    time: String(time || DEFAULT_TIME),
    timeZone: String(timeZone || DEFAULT_TIMEZONE),
  };
}

async function getVerifiedAdminEmail() {
  const rows = await query(
    `SELECT email FROM users
      WHERE is_platform_admin = 1 AND email_verified = 1 AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`,
  );
  return String(rows[0]?.email || '').trim();
}

async function getLastBackup() {
  const rows = await query(
    `SELECT id, trigger_type, local_date, status, identity_name,
            backup_size_bytes, backup_sha256, rsc_size_bytes, rsc_sha256,
            recipient_masked, failure_code, started_at, sent_at, finished_at
       FROM core_backup_runs ORDER BY started_at DESC LIMIT 1`,
  );
  return rows[0] || null;
}

async function acquireRun(triggerType, timeZone) {
  const now = Date.now();
  const localDate = localDateParts(new Date(now), timeZone).date;
  const id = crypto.randomUUID();
  const dedupeKey = triggerType === 'scheduled' ? `scheduled:${localDate}` : `manual:${id}`;
  if (triggerType === 'manual') {
    const recent = await query(
      `SELECT id FROM core_backup_runs
        WHERE trigger_type = 'manual' AND started_at >= ? AND status = 'RUNNING' LIMIT 1`,
      [now - 60_000],
    );
    if (recent.length) throw codedError('Ya hay un respaldo manual en ejecución.', 'BACKUP_IN_PROGRESS');
  }
  try {
    await query(
      `INSERT INTO core_backup_runs
        (id, dedupe_key, trigger_type, local_date, status, started_at)
       VALUES (?, ?, ?, ?, 'RUNNING', ?)`,
      [id, dedupeKey, triggerType, localDate, now],
    );
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return null;
    throw error;
  }
  return { id, localDate };
}

function remoteFileName(row) {
  return String(row?.name || '').replace(/^\/+/, '');
}

async function findRemoteFiles(api, names) {
  const rows = await safeWrite(api, ['/file/print']).catch(() => []);
  const wanted = new Set(names);
  return rows.filter(row => wanted.has(remoteFileName(row)));
}

async function waitForRemotePair(api, names, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await findRemoteFiles(api, names);
    if (names.every(name => rows.some(row => remoteFileName(row) === name))) return rows;
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw codedError('RouterOS no terminó de generar ambos archivos.', 'BACKUP_GENERATION_TIMEOUT');
}

async function removeRemoteFiles(api, names) {
  const rows = await findRemoteFiles(api, names);
  for (const row of rows) {
    if (!row['.id']) continue;
    await safeWrite(api, ['/file/remove', `=.id=${row['.id']}`]).catch(() => {});
  }
}

async function cleanupRemoteArtifacts(api) {
  const rows = await safeWrite(api, ['/file/print']).catch(() => []);
  for (const row of rows) {
    if (!remoteFileName(row).startsWith(PREFIX) || !row['.id']) continue;
    await safeWrite(api, ['/file/remove', `=.id=${row['.id']}`]).catch(() => {});
  }
}

async function cleanupLocalArtifacts(maxAgeMs = 2 * 60 * 60 * 1000) {
  const now = Date.now();
  const entries = await fs.promises.readdir(os.tmpdir(), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TMP_PREFIX)) continue;
    const target = path.join(os.tmpdir(), entry.name);
    const stat = await fs.promises.stat(target).catch(() => null);
    if (stat && now - stat.mtimeMs >= maxAgeMs) await fs.promises.rm(target, { recursive: true, force: true });
  }
}

function sftpGetPair({ host, port, username, password, files, localDir }) {
  return new Promise((resolve, reject) => {
    const client = new SSHClient();
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      try { client.end(); } catch (_) { /* noop */ }
      if (err) reject(err); else resolve();
    };
    const timer = setTimeout(() => {
      client.destroy();
      finish(codedError('Tiempo de espera SFTP agotado.', 'SFTP_TIMEOUT'));
    }, 45_000);
    client.on('ready', () => client.sftp(async (error, sftp) => {
      if (error) { clearTimeout(timer); return finish(error); }
      try {
        for (const name of files) {
          const destination = path.join(localDir, name);
          try {
            await new Promise((res, rej) => sftp.fastGet(`/${name}`, destination, err => err ? rej(err) : res()));
          } catch (_) {
            await new Promise((res, rej) => sftp.fastGet(name, destination, err => err ? rej(err) : res()));
          }
        }
        clearTimeout(timer);
        finish();
      } catch (downloadError) {
        clearTimeout(timer);
        finish(downloadError);
      }
    }));
    client.on('error', error => { clearTimeout(timer); finish(error); });
    client.connect({
      host, port, username, password, readyTimeout: 12_000,
      algorithms: {
        kex: ['curve25519-sha256', 'ecdh-sha2-nistp256', 'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
        serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
        cipher: ['aes128-ctr', 'aes256-ctr', 'aes128-cbc'],
        hmac: ['hmac-sha2-256', 'hmac-sha1'],
      },
    });
  });
}

async function runCoreBackup(triggerType = 'manual') {
  const config = await loadConfig();
  if (!config.ip || !config.user || !config.pass) throw codedError('Configura las credenciales del MikroTik.', 'CORE_NOT_CONFIGURED');
  if (config.backupPassword.length < 12) throw codedError('Configura una contraseña de respaldo de al menos 12 caracteres.', 'BACKUP_PASSWORD_REQUIRED');
  const recipient = await getVerifiedAdminEmail();
  if (!recipient) throw codedError('El Administrador no tiene un correo verificado.', 'ADMIN_EMAIL_REQUIRED');
  const run = await acquireRun(triggerType, config.timeZone);
  if (!run) return { skipped: true, reason: 'ALREADY_SENT_TODAY' };

  let api;
  let tempDir;
  let sshOriginal = null;
  let names = [];
  try {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX));
    await fs.promises.chmod(tempDir, 0o700).catch(() => {});
    api = await connectToMikrotik(config.ip, config.user, config.pass);
    await cleanupRemoteArtifacts(api);
    const identityRows = await safeWrite(api, ['/system/identity/print']);
    const identity = identityRows[0]?.name || 'MikroTik';
    const stem = buildBackupStem(identity, new Date(), config.timeZone);
    names = [`${stem}.backup`, `${stem}.rsc`];

    await safeWrite(api, ['/system/backup/save', `=name=${stem}`, '=encryption=aes-sha256', `=password=${config.backupPassword}`], 30_000);
    await safeWrite(api, ['/export', `=file=${stem}`], 30_000);
    await waitForRemotePair(api, names);

    const services = await safeWrite(api, ['/ip/service/print']);
    const ssh = services.find(item => item.name === 'ssh' && item['.id']);
    if (!ssh) throw codedError('No se encontró el servicio SSH/SFTP de RouterOS.', 'SSH_SERVICE_NOT_FOUND');
    sshOriginal = { id: ssh['.id'], disabled: String(ssh.disabled || 'false'), address: String(ssh.address || ''), port: Number(ssh.port || 22) };
    const sourceCidr = process.env.CORE_BACKUP_SSH_SOURCE_CIDR || `${mgmtNet.vps.ip}/32`;
    const temporaryAddresses = sshOriginal.disabled === 'true'
      ? sourceCidr
      : [...new Set([...sshOriginal.address.split(',').map(x => x.trim()).filter(Boolean), sourceCidr])].join(',');
    await safeWrite(api, ['/ip/service/set', `=.id=${sshOriginal.id}`, '=disabled=no', `=address=${temporaryAddresses}`]);

    await sftpGetPair({
      host: config.ip, port: sshOriginal.port, username: config.user, password: config.pass,
      files: names, localDir: tempDir,
    });
    const backupPath = path.join(tempDir, names[0]);
    const rscPath = path.join(tempDir, names[1]);
    const [backupStat, rscStat, rscContent] = await Promise.all([
      fs.promises.stat(backupPath), fs.promises.stat(rscPath), fs.promises.readFile(rscPath, 'utf8'),
    ]);
    if (!backupStat.size || !rscStat.size || backupStat.size + rscStat.size > MAX_BYTES) {
      throw codedError('El par de respaldo está vacío o excede el tamaño permitido.', 'BACKUP_SIZE_INVALID');
    }
    validateRscContent(rscContent);
    const [backupHash, rscHash] = await Promise.all([fileSha256(backupPath), fileSha256(rscPath)]);
    const delivery = await sendGeneric({
      to: recipient,
      subject: `[VPN Manager] Respaldo diario ${sanitizeIdentity(identity)} - ${run.localDate}`,
      text: `Respaldo dual del servidor ${identity}. Se adjuntan el .backup cifrado AES-SHA256 y el export .rsc legible. La contraseña no se incluye en este correo.`,
      kind: 'core_backup',
      attachments: [
        { filename: names[0], path: backupPath, contentType: 'application/octet-stream' },
        { filename: names[1], path: rscPath, contentType: 'text/plain; charset=utf-8' },
      ],
    });
    if (!delivery.delivered) throw codedError(delivery.dev ? 'SMTP no está configurado.' : 'No se pudo enviar el correo.', 'BACKUP_EMAIL_FAILED');
    const finishedAt = Date.now();
    await query(
      `UPDATE core_backup_runs SET status='SENT', identity_name=?, backup_size_bytes=?, backup_sha256=?,
              rsc_size_bytes=?, rsc_sha256=?, recipient_masked=?, sent_at=?, finished_at=? WHERE id=?`,
      [identity, backupStat.size, backupHash, rscStat.size, rscHash, maskEmail(recipient), finishedAt, finishedAt, run.id],
    );
    return { sent: true, filenames: names, identity, recipient: maskEmail(recipient), sizes: { backup: backupStat.size, rsc: rscStat.size } };
  } catch (error) {
    const failureCode = String(error.code || classifyError(error) || 'BACKUP_FAILED').slice(0, 80);
    await query(
      `UPDATE core_backup_runs SET status='FAILED', failure_code=?, finished_at=? WHERE id=?`,
      [failureCode, Date.now(), run.id],
    ).catch(() => {});
    log.warn({ failureCode, runId: run.id }, 'Falló el respaldo dual del core');
    throw error;
  } finally {
    if (api && sshOriginal) {
      await safeWrite(api, ['/ip/service/set', `=.id=${sshOriginal.id}`,
        `=disabled=${sshOriginal.disabled}`, `=address=${sshOriginal.address}`]).catch(() => {});
    }
    if (api && names.length) await removeRemoteFiles(api, names).catch(() => {});
    if (api) try { await api.close(); } catch (_) { /* noop */ }
    if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  DEFAULT_TIMEZONE, DEFAULT_TIME, sanitizeIdentity, localDateParts, buildBackupStem,
  maskEmail, validateRscContent, cleanupLocalArtifacts, getLastBackup, loadConfig,
  runCoreBackup,
};
