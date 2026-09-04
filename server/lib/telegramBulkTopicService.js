const crypto = require('crypto');
const { query, withTransaction } = require('../db/mysql');
const integrations = require('./workspaceIntegrationService');
const telegram = require('./telegram');
const forums = require('./telegramForumService');
const { AppError } = require('./apiResponse');

const snapshots = require('./mikrowispClientSnapshot');
const activeJobs = new Set();
let jobQueue = Promise.resolve();
const BASE_DELAY_MS = Math.max(3500, Number(process.env.TELEGRAM_TOPIC_BULK_DELAY_MS) || 3500);
const sleep = ms => new Promise(resolve => { const timer = setTimeout(resolve, ms); timer.unref?.(); });

function publicJob(row) {
  return {
    id: row.id, groupId: row.group_id, status: row.status, retryAt: row.retry_at ? Number(row.retry_at) : null,
    totalClients: Number(row.total_clients), existing: Number(row.existing_count), pending: Number(row.pending_count),
    created: Number(row.created_count), skipped: Number(row.skipped_count), failed: Number(row.failed_count),
    startedAt: row.started_at ? Number(row.started_at) : null, finishedAt: row.finished_at ? Number(row.finished_at) : null,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  };
}

async function assertGroup(workspaceId, groupId) {
  const rows = await query("SELECT id FROM telegram_forum_groups WHERE id=? AND workspace_id=? AND status='ACTIVE' LIMIT 1", [groupId, workspaceId]);
  if (!rows[0]) throw new AppError('Grupo no encontrado o inactivo', 404, 'TELEGRAM_GROUP_NOT_FOUND');
  await forums.requireCapability(groupId, 'CLIENT_TOPICS');
}

async function preview(workspaceId, groupId) {
  await assertGroup(workspaceId, groupId);
  const clients = await snapshots.read(workspaceId);
  if (!clients.length) throw new AppError('Importa primero los clientes de MikroWisp.', 409, 'MIKROWISP_IMPORT_REQUIRED');
  const rows = await query("SELECT client_external_id,status FROM telegram_forum_topics WHERE workspace_id=? AND group_id=? AND client_external_id NOT LIKE 'UNREGISTERED:%' AND status<>'DELETED'", [workspaceId, groupId]);
  const existingIds = new Set(rows.map(row => String(row.client_external_id)));
  const pending = clients.filter(client => !existingIds.has(client.id));
  return { totalClients: clients.length, existing: clients.length - pending.length, pending: pending.length, skipped: 0 };
}

async function start(workspaceId, userId, groupId) {
  await assertGroup(workspaceId, groupId);
  const running = await query("SELECT * FROM telegram_topic_bulk_jobs WHERE workspace_id=? AND group_id=? AND status IN ('PENDING','RUNNING','PAUSED') ORDER BY created_at DESC LIMIT 1", [workspaceId, groupId]);
  if (running[0]) {
    kick(running[0].id);
    return publicJob(running[0]);
  }
  const clients = await snapshots.read(workspaceId);
  if (!clients.length) throw new AppError('Importa primero los clientes de MikroWisp.', 409, 'MIKROWISP_IMPORT_REQUIRED');
  const topics = await query("SELECT client_external_id FROM telegram_forum_topics WHERE workspace_id=? AND group_id=? AND client_external_id NOT LIKE 'UNREGISTERED:%' AND status<>'DELETED'", [workspaceId, groupId]);
  const existingIds = new Set(topics.map(row => String(row.client_external_id)));
  const pendingClients = clients.filter(client => !existingIds.has(client.id));
  const now = Date.now(); const jobId = crypto.randomUUID();
  await withTransaction(async tx => {
    await tx.query(`INSERT INTO telegram_topic_bulk_jobs
      (id,workspace_id,group_id,status,total_clients,existing_count,pending_count,requested_by,created_at,updated_at)
      VALUES (?,?,?,'PENDING',?,?,?,?,?,?)`, [jobId, workspaceId, groupId, clients.length, clients.length - pendingClients.length, pendingClients.length, userId, now, now]);
    for (const client of pendingClients) {
      await tx.query(`INSERT INTO telegram_topic_bulk_items
        (id,job_id,workspace_id,group_id,client_external_id,client_name,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'PENDING',?,?)`, [crypto.randomUUID(), jobId, workspaceId, groupId, client.id, client.name, now, now]);
    }
  });
  if (pendingClients.length === 0) {
    await query("UPDATE telegram_topic_bulk_jobs SET status='COMPLETED',finished_at=?,updated_at=? WHERE id=?", [now, now, jobId]);
  } else kick(jobId);
  return get(workspaceId, groupId, jobId);
}

async function get(workspaceId, groupId, jobId) {
  const rows = await query('SELECT * FROM telegram_topic_bulk_jobs WHERE id=? AND workspace_id=? AND group_id=? LIMIT 1', [jobId, workspaceId, groupId]);
  if (!rows[0]) throw new AppError('Proceso de creación no encontrado', 404, 'TELEGRAM_BULK_JOB_NOT_FOUND');
  if (['PENDING', 'RUNNING'].includes(rows[0].status)) kick(jobId);
  return publicJob(rows[0]);
}

async function latest(workspaceId, groupId) {
  const rows = await query('SELECT * FROM telegram_topic_bulk_jobs WHERE workspace_id=? AND group_id=? ORDER BY created_at DESC LIMIT 1', [workspaceId, groupId]);
  if (!rows[0]) return null;
  if (['PENDING', 'RUNNING'].includes(rows[0].status)) kick(rows[0].id);
  return publicJob(rows[0]);
}

async function pause(workspaceId, groupId, jobId) {
  await query("UPDATE telegram_topic_bulk_jobs SET status='PAUSED',updated_at=? WHERE id=? AND workspace_id=? AND group_id=? AND status IN ('PENDING','RUNNING')", [Date.now(), jobId, workspaceId, groupId]);
  return get(workspaceId, groupId, jobId);
}

async function resume(workspaceId, groupId, jobId) {
  await query("UPDATE telegram_topic_bulk_jobs SET status='PENDING',updated_at=? WHERE id=? AND workspace_id=? AND group_id=? AND status='PAUSED'", [Date.now(), jobId, workspaceId, groupId]);
  kick(jobId);
  return get(workspaceId, groupId, jobId);
}

function kick(jobId) {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);
  jobQueue = jobQueue.then(() => processJob(jobId)).catch(() => query("UPDATE telegram_topic_bulk_jobs SET status='PAUSED',updated_at=? WHERE id=? AND status IN ('PENDING','RUNNING')", [Date.now(), jobId])).catch(() => {}).finally(() => activeJobs.delete(jobId));
}

async function processJob(jobId) {
  const jobs = await query("SELECT j.*,g.telegram_chat_id,g.status AS group_status FROM telegram_topic_bulk_jobs j JOIN telegram_forum_groups g ON g.id=j.group_id AND g.workspace_id=j.workspace_id WHERE j.id=? LIMIT 1", [jobId]);
  const job = jobs[0];
  if (!job || !['PENDING', 'RUNNING'].includes(job.status) || job.group_status !== 'ACTIVE') return;
  const config = await integrations.getSecret(job.workspace_id, 'TELEGRAM');
  if (!config?.botToken) return;
  // Recupera únicamente rechazos definitivos 429 de versiones anteriores, nunca CREATE_UNKNOWN.
  await withTransaction(async tx => {
    await tx.query("UPDATE telegram_forum_topics t JOIN telegram_topic_bulk_items i ON i.topic_id=t.id AND i.workspace_id=t.workspace_id SET t.status='DELETED',t.updated_at=? WHERE i.job_id=? AND i.status='FAILED' AND i.error_code='TELEGRAM_RATE_LIMIT' AND t.status='REPAIR_REQUIRED' AND t.telegram_thread_id IS NULL", [Date.now(), jobId]);
    await tx.query("UPDATE telegram_topic_bulk_items i JOIN telegram_forum_topics t ON t.id=i.topic_id AND t.workspace_id=i.workspace_id SET i.status='PENDING',i.error_code=NULL,i.updated_at=? WHERE i.job_id=? AND i.status='FAILED' AND i.error_code='TELEGRAM_RATE_LIMIT' AND t.status='DELETED' AND t.telegram_thread_id IS NULL", [Date.now(), jobId]);
  });
  await query("UPDATE telegram_topic_bulk_jobs SET status='RUNNING',started_at=COALESCE(started_at,?),updated_at=? WHERE id=?", [Date.now(), Date.now(), jobId]);
  while (true) {
    const state = await query('SELECT status,retry_at FROM telegram_topic_bulk_jobs WHERE id=? LIMIT 1', [jobId]);
    if (state[0]?.status !== 'RUNNING') return;
    const remainingWait = Number(state[0]?.retry_at || 0) - Date.now();
    if (remainingWait > 0) { await sleep(Math.min(1000, remainingWait)); continue; }
    const items = await query("SELECT * FROM telegram_topic_bulk_items WHERE job_id=? AND status='PENDING' ORDER BY client_external_id+0 LIMIT 1", [jobId]);
    const item = items[0];
    if (!item) break;
    const duplicate = await query("SELECT id,status FROM telegram_forum_topics WHERE group_id=? AND client_external_id=? LIMIT 1", [job.group_id, item.client_external_id]);
    if (duplicate[0] && duplicate[0].status !== 'DELETED') {
      await query("UPDATE telegram_topic_bulk_items SET status='SKIPPED',topic_id=?,updated_at=? WHERE id=?", [duplicate[0].id, Date.now(), item.id]);
      await refreshCounts(jobId); continue;
    }
    const topicId = duplicate[0]?.id || crypto.randomUUID(); const prefix = `${item.client_external_id} · `;
    const topicName = `${prefix}${forums.clean(item.client_name, Math.max(1, 128 - prefix.length))}`.slice(0, 128); const now = Date.now();
    try {
      if (duplicate[0]?.status === 'DELETED') {
        const claimed = await query("UPDATE telegram_forum_topics SET status='CREATING',telegram_thread_id=NULL,updated_at=? WHERE id=? AND status='DELETED'", [now, topicId]);
        if (!claimed.affectedRows) throw new AppError('Otro proceso está operando el tema', 409, 'TOPIC_BUSY');
      } else await query(`INSERT INTO telegram_forum_topics (id,workspace_id,group_id,client_external_id,client_name,topic_name,status,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'CREATING',?,?,?)`, [topicId, job.workspace_id, job.group_id, item.client_external_id, item.client_name, topicName, job.requested_by, now, now]);
      const created = await telegram.createForumTopic({ token: config.botToken, chatId: job.telegram_chat_id, name: topicName });
      if (!created.ok && created.status === 429 && created.definite === true && !created.ambiguous) {
        const retrySeconds = Number(created.retryAfter);
        const retryAt = Date.now() + Math.max(BASE_DELAY_MS, (Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds : 60) * 1000) + 1000;
        await withTransaction(async tx => {
          await tx.query("UPDATE telegram_forum_topics SET status='DELETED',updated_at=? WHERE id=? AND status='CREATING'", [Date.now(), topicId]);
          await tx.query("UPDATE telegram_topic_bulk_items SET status='PENDING',topic_id=?,error_code='TELEGRAM_RATE_LIMIT',attempts=attempts+1,updated_at=? WHERE id=?", [topicId, Date.now(), item.id]);
          await tx.query('UPDATE telegram_topic_bulk_jobs SET retry_at=?,updated_at=? WHERE id=?', [retryAt, Date.now(), jobId]);
        });
        await refreshCounts(jobId);
        continue;
      }
      if (!created.ok) {
        const topicStatus = created.ambiguous ? 'CREATE_UNKNOWN' : 'REPAIR_REQUIRED';
        await query('UPDATE telegram_forum_topics SET status=?,updated_at=? WHERE id=?', [topicStatus, Date.now(), topicId]);
        await query("UPDATE telegram_topic_bulk_items SET status='FAILED',topic_id=?,error_code=?,attempts=attempts+1,updated_at=? WHERE id=?", [topicId, created.status === 429 ? 'TELEGRAM_RATE_LIMIT' : topicStatus, Date.now(), item.id]);
        await refreshCounts(jobId);
        await sleep(BASE_DELAY_MS);
        continue;
      }
      await query('UPDATE telegram_topic_bulk_jobs SET retry_at=NULL WHERE id=?', [jobId]);
      forums.rememberManagedThread(job.telegram_chat_id, created.result.message_thread_id);
      await query("UPDATE telegram_forum_topics SET telegram_thread_id=?,status='ACTIVE',updated_at=? WHERE id=?", [String(created.result.message_thread_id), Date.now(), topicId]);
      await query("UPDATE telegram_topic_bulk_items SET status='CREATED',topic_id=?,attempts=attempts+1,updated_at=? WHERE id=?", [topicId, Date.now(), item.id]);
    } catch (error) {
      await query("UPDATE telegram_topic_bulk_items SET status='FAILED',error_code=?,attempts=attempts+1,updated_at=? WHERE id=?", [String(error.code || 'INTERNAL').slice(0, 64), Date.now(), item.id]);
    }
    await refreshCounts(jobId);
    await sleep(BASE_DELAY_MS);
  }
  await refreshCounts(jobId, true);
}

async function refreshCounts(jobId, finish = false) {
  const rows = await query(`SELECT
    SUM(status='PENDING') pending_count,SUM(status='CREATED') created_count,
    SUM(status='SKIPPED') skipped_count,SUM(status='FAILED') failed_count
    FROM telegram_topic_bulk_items WHERE job_id=?`, [jobId]);
  const counts = rows[0] || {};
  await query(`UPDATE telegram_topic_bulk_jobs SET pending_count=?,created_count=?,skipped_count=?,failed_count=?,
    status=IF(status='PAUSED','PAUSED',?),finished_at=?,updated_at=? WHERE id=?`, [Number(counts.pending_count || 0), Number(counts.created_count || 0), Number(counts.skipped_count || 0), Number(counts.failed_count || 0), finish ? 'COMPLETED' : 'RUNNING', finish ? Date.now() : null, Date.now(), jobId]);
}

module.exports = { preview, start, get, latest, pause, resume, publicJob, processJob };
