import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');
const query = vi.fn();
const integrations = { listMikrowispClients: vi.fn(), getSecret: vi.fn() };
const snapshots = { read: vi.fn() };
stubModule(__dirname, '../../lib/mikrowispClientSnapshot', snapshots);
const forums = { requireCapability: vi.fn(), rememberManagedThread: vi.fn(), clean: value => String(value).trim() };
stubModule(__dirname, '../../db/mysql', { query, withTransaction: async fn => fn({ query }) });
stubModule(__dirname, '../../lib/workspaceIntegrationService', integrations);
stubModule(__dirname, '../../lib/telegramForumService', forums);
const telegram = { createForumTopic: vi.fn() };
stubModule(__dirname, '../../lib/telegram', telegram);
const service = require('../../lib/telegramBulkTopicService');

describe('telegramBulkTopicService', () => {
  beforeEach(() => { vi.clearAllMocks(); snapshots.read.mockResolvedValue([{ id: '1', name: 'Ana' }, { id: '2', name: 'Luis' }, { id: '3', name: 'Rosa' }]); });

  it('previsualiza desde la copia local sin consultar MikroWisp y omite temas existentes', async () => {
    query.mockImplementation(async sql => sql.includes('FROM telegram_forum_groups') ? [{ id: 'g-1' }] : [{ client_external_id: '2', status: 'ACTIVE' }]);
    const result = await service.preview('ws-1', 'g-1');
    expect(result).toEqual({ totalClients: 3, existing: 1, pending: 2, skipped: 0 });
    expect(integrations.listMikrowispClients).not.toHaveBeenCalled();
    expect(snapshots.read).toHaveBeenCalledWith('ws-1');
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status<>'DELETED'"), ['ws-1', 'g-1']);
    expect(forums.requireCapability).toHaveBeenCalledWith('g-1', 'CLIENT_TOPICS');
  });
  it('rechaza un grupo ajeno antes de consultar la copia local', async () => {
    query.mockResolvedValue([]);
    await expect(service.preview('ws-a', 'g-other')).rejects.toMatchObject({ code: 'TELEGRAM_GROUP_NOT_FOUND' });
    expect(snapshots.read).not.toHaveBeenCalled();
  });

  it('reutiliza un registro eliminado y crea sólo un tema con una pausa', async () => {
    vi.useFakeTimers();
    let hasItem = true;
    query.mockImplementation(async sql => {
      if (sql.startsWith('SELECT j.')) return [{ id: 'job', workspace_id: 'ws', group_id: 'g', telegram_chat_id: '-100', status: 'PENDING', group_status: 'ACTIVE' }];
      if (sql.startsWith('SELECT status')) return [{ status: 'RUNNING' }];
      if (sql.includes("status='PENDING' ORDER BY")) { if (!hasItem) return []; hasItem = false; return [{ id: 'item', client_external_id: '1', client_name: 'Ana' }]; }
      if (sql.startsWith('SELECT id,status')) return [{ id: 'old-topic', status: 'DELETED' }];
      if (sql.includes('SUM(status=')) return [{ created_count: 1 }];
      return { affectedRows: 1 };
    });
    integrations.getSecret.mockResolvedValue({ botToken: 'test' });
    telegram.createForumTopic.mockResolvedValue({ ok: true, result: { message_thread_id: 88 } });
    try {
      const processing = service.processJob('job');
      await vi.advanceTimersByTimeAsync(3500);
      await processing;
      expect(telegram.createForumTopic).toHaveBeenCalledTimes(1);
      expect(forums.rememberManagedThread).toHaveBeenCalledWith('-100', 88);
      expect(query).toHaveBeenCalledWith(expect.stringContaining("status='ACTIVE'"), ['88', expect.any(Number), 'old-topic']);
      expect(integrations.listMikrowispClients).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

});

describe('espera automática de Telegram', () => {
  it.each([false, true])('respeta retry_after y la pausa manual (%s)', async manualPause => {
    vi.useFakeTimers();
    let status = 'RUNNING', retryAt = null, topicStatus = null, done = false;
    query.mockImplementation(async (sql, values) => {
      if (sql.startsWith('SELECT j.')) return [{ id: 'job', workspace_id: 'ws', group_id: 'g', telegram_chat_id: '-100', status: 'RUNNING', group_status: 'ACTIVE' }];
      if (sql.startsWith('SELECT status')) return [{ status, retry_at: retryAt }];
      if (sql.includes("status='PENDING' ORDER BY")) return done ? [] : [{ id: 'item', client_external_id: '1', client_name: 'Ana' }];
      if (sql.startsWith('SELECT id,status')) return topicStatus ? [{ id: 'topic', status: topicStatus }] : [];
      if (sql.startsWith('UPDATE telegram_forum_topics SET')) {
        if (sql.includes("status='DELETED'")) topicStatus = 'DELETED';
        if (sql.includes("status='ACTIVE'")) topicStatus = 'ACTIVE';
      }
      if (sql.startsWith('UPDATE telegram_topic_bulk_jobs SET retry_at=?')) retryAt = values[0];
      if (sql.startsWith('UPDATE telegram_topic_bulk_jobs SET retry_at=NULL')) retryAt = null;
      if (sql.includes("UPDATE telegram_topic_bulk_items SET status='CREATED'")) done = true;
      if (sql.includes('SUM(status=')) return [{ pending_count: done ? 0 : 1, created_count: done ? 1 : 0 }];
      return { affectedRows: 1 };
    });
    integrations.getSecret.mockResolvedValue({ botToken: 'test' });
    telegram.createForumTopic.mockReset();
    telegram.createForumTopic.mockResolvedValueOnce({ ok: false, status: 429, definite: true, retryAfter: 10 }).mockResolvedValueOnce({ ok: true, result: { message_thread_id: 99 } });
    try {
      const processing = service.processJob('job');
      await vi.advanceTimersByTimeAsync(0);
      expect(telegram.createForumTopic).toHaveBeenCalledTimes(1);
      expect(retryAt).toBeGreaterThan(Date.now());
      await vi.advanceTimersByTimeAsync(10000);
      expect(telegram.createForumTopic).toHaveBeenCalledTimes(1);
      if (manualPause) status = 'PAUSED';
      await vi.advanceTimersByTimeAsync(4500);
      await processing;
      expect(telegram.createForumTopic).toHaveBeenCalledTimes(manualPause ? 1 : 2);
      expect(query.mock.calls.some(([sql]) => sql.includes("SET status='FAILED'"))).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
