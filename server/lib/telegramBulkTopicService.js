const crypto = require('crypto');
const { query, withTransaction } = require('../db/mysql');
const integrations = require('./workspaceIntegrationService');
const telegram = require('./telegram');
const forums = require('./telegramForumService');
const { AppError } = require('./apiResponse');

const activeJobs = new Set();
const BASE_DELAY_MS = Number(process.env.TELEGRAM_TOPIC_BULK_DELAY_MS || 1500);
const sleep = ms => new Promise(resolve => { const timer = setTimeout(resolve, ms); timer.unref?.(); });

function publicJob(row) {
  return {
    id: row.id, groupId: row.group_id, status: row.status,
    totalClients: Number(row.total_clients), existing: Number(row.existing_count), pending: Number(row.pending_count),
    created: Number(row.created_count), skipped: Number(row.skipped_count), failed: Number(row.failed_count),
    startedAt: row.started_at ? Number(row.started_at) : null, finishedAt: row.finished_at ? Number(row.finished_at) : null,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  };
}

async function preview(workspaceId, groupId) {
  await forums.requireCapability(groupId, 'CLIENT_TOPICS');
  const clients = await integrations.listMikrowispClients(workspaceId);
  const rows = await query("SELECT client_external_id,status FROM telegram_forum_topics WHERE workspace_id=? AND group_id=? AND client_external_id NOT LIKE 'UNREGISTERED:%'", [workspaceId, groupId]);
  const existingIds = new Set(rows.map(row => String(row.client_external_id)));
  const pending = clients.filter(client => !existingIds.has(client.id));
  return { totalClients: clients.length, existing: clients.length - pending.length, pending: pending.length, skipped: 0 };
}

async function start(workspaceId, userId, groupId) {
  await forums.requireCapability(groupId, 'CLIENT_TOPICS');
  const running = await query("SELECT * FROM telegram_topic_bulk_jobs WHERE workspace_id=? AND group_id=? AND status IN ('PENDING','RUNNING','PAUSED') ORDER BY created_at DESC LIMIT 1", [workspaceId, groupId]);
  if (running[0]) {
    kick(running[0].id);
    return publicJob(running[0]);
  }
  const clients = await integrations.listMikrowispClients(workspaceId);
  const topics = await query("SELECT client_external_id FROM telegram_forum_topics WHERE workspace_id=? AND group_id=? AND client_external_id NOT LIKE 'UNREGISTERED:%'", [workspaceId, groupId]);
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
  void processJob(jobId).finally(() => activeJobs.delete(jobId));
}

async function processJob(jobId) {
  const jobs = await query("SELECT j.*,g.telegram_chat_id,g.status AS group_status FROM telegram_topic_bulk_jobs j JOIN telegram_forum_groups g ON g.id=j.group_id WHERE j.id=? LIMIT 1", [jobId]);
  const job = jobs[0];
  if (!job || !['PENDING', 'RUNNING'].includes(job.status) || job.group_status !== 'ACTIVE') return;
  const config = await integrations.getSecret(job.workspace_id, 'TELEGRAM');
  if (!config?.botToken) return;
  await query("UPDATE telegram_topic_bulk_jobs SET status='RUNNING',started_at=COALESCE(started_at,?),updated_at=? WHERE id=?", [Date.now(), Date.now(), jobId]);
  while (true) {
    const state = await query('SELECT status FROM telegram_topic_bulk_jobs WHERE id=? LIMIT 1', [jobId]);
    if (state[0]?.status !== 'RUNNING') return;
    const items = await query("SELECT * FROM telegram_topic_bulk_items WHERE job_id=? AND status='PENDING' ORDER BY client_external_id+0 LIMIT 1", [jobId]);
    const item = items[0];
    if (!item) break;
    const duplicate = await query("SELECT id FROM telegram_forum_topics WHERE group_id=? AND client_external_id=? LIMIT 1", [job.group_id, item.client_external_id]);
    if (duplicate[0]) {
      await query("UPDATE telegram_topic_bulk_items SET status='SKIPPED',topic_id=?,updated_at=? WHERE id=?", [duplicate[0].id, Date.now(), item.id]);
      await refreshCounts(jobId); continue;
    }
    const topicId = crypto.randomUUID(); const prefix = `${item.client_external_id} · `;
    const topicName = `${prefix}${forums.clean(item.client_name, Math.max(1, 128 - prefix.length))}`.slice(0, 128); const now = Date.now();
    try {
      await query(`INSERT INTO telegram_forum_topics (id,workspace_id,group_id,client_external_id,client_name,topic_name,status,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'CREATING',?,?,?)`, [topicId, job.workspace_id, job.group_id, item.client_external_id, item.client_name, topicName, job.requested_by, now, now]);
      const created = await telegram.createForumTopic({ token: config.botToken, chatId: job.telegram_chat_id, name: topicName });
      if (!created.ok) {
        const topicStatus = created.ambiguous ? 'CREATE_UNKNOWN' : 'REPAIR_REQUIRED';
        await query('UPDATE telegram_forum_topics SET status=?,updated_at=? WHERE id=?', [topicStatus, Date.now(), topicId]);
        await query("UPDATE telegram_topic_bulk_items SET status='FAILED',topic_id=?,error_code=?,attempts=attempts+1,updated_at=? WHERE id=?", [topicId, created.status === 429 ? 'TELEGRAM_RATE_LIMIT' : topicStatus, Date.now(), item.id]);
        await refreshCounts(jobId);
        if (created.status === 429) await sleep(Math.max(BASE_DELAY_MS, Number(created.retryAfter || 5) * 1000));
        else await sleep(BASE_DELAY_MS);
        continue;
      }
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
    status=?,finished_at=?,updated_at=? WHERE id=?`, [Number(counts.pending_count || 0), Number(counts.created_count || 0), Number(counts.skipped_count || 0), Number(counts.failed_count || 0), finish ? 'COMPLETED' : 'RUNNING', finish ? Date.now() : null, Date.now(), jobId]);
}

module.exports = { preview, start, get, latest, pause, resume, publicJob, processJob };
