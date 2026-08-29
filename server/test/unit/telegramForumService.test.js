import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const query = vi.fn();
const integrations = { getSecret: vi.fn(), getMikrowispClient: vi.fn() };
const telegram = { createForumTopic: vi.fn(), closeForumTopic: vi.fn(), reopenForumTopic: vi.fn(), getChat: vi.fn(), getChatMember: vi.fn(), callBotApi: vi.fn(), createChatInviteLink: vi.fn(), revokeChatInviteLink: vi.fn(), approveChatJoinRequest: vi.fn(), declineChatJoinRequest: vi.fn(), banChatMember: vi.fn(), unbanChatMember: vi.fn() };
stubModule(__dirname, '../../db/mysql', { query, withTransaction: vi.fn() });
stubModule(__dirname, '../../lib/workspaceIntegrationService', integrations);
stubModule(__dirname, '../../lib/telegram', telegram);
const service = require('../../lib/telegramForumService');

const group = { id: 'g-1', workspace_id: 'ws-1', telegram_chat_id: '-1001', display_name: 'Clientes', status: 'ACTIVE', created_at: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  query.mockImplementation(async sql => {
    if (sql.includes('FROM telegram_forum_groups') && sql.includes("status='ACTIVE'")) return [group];
    if (sql.includes('FROM telegram_forum_topics')) return [];
    return { affectedRows: 1 };
  });
  integrations.getSecret.mockResolvedValue({ botToken: '123456:valid-token-for-tests-abcdef' });
  integrations.getMikrowispClient.mockResolvedValue({ id: '14', name: 'Ana Pérez', status: 'ACTIVO' });
  telegram.createForumTopic.mockResolvedValue({ ok: true, result: { message_thread_id: 77 } });
  telegram.createChatInviteLink.mockResolvedValue({ ok: true, result: { invite_link: 'https://t.me/+individual' } });
  telegram.approveChatJoinRequest.mockResolvedValue({ ok: true });
  telegram.declineChatJoinRequest.mockResolvedValue({ ok: true });
});

describe('telegramForumService', () => {
  it('construye vista previa canónica sin perder el ID', async () => {
    integrations.getMikrowispClient.mockResolvedValue({ id: '14', name: `Ana ${'Largo '.repeat(40)}` });
    const preview = await service.previewTopic('ws-1', 'g-1', '0014');
    expect(preview.topicName.startsWith('14 · Ana')).toBe(true);
    expect(preview.topicName.length).toBeLessThanOrEqual(128);
  });

  it('reserva antes de llamar Telegram y confirma el thread ID', async () => {
    const topic = await service.createTopic('ws-1', 'u-1', 'g-1', '14');
    const insertIndex = query.mock.calls.findIndex(([sql]) => sql.includes('INSERT INTO telegram_forum_topics'));
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(telegram.createForumTopic).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-1001', name: '14 · Ana Pérez' }));
    expect(topic).toMatchObject({ clientId: '14', threadId: '77', status: 'ACTIVE' });
  });

  it('marca CREATE_UNKNOWN y no reintenta cuando Telegram responde ambiguamente', async () => {
    telegram.createForumTopic.mockResolvedValue({ ok: false, ambiguous: true, error: 'timeout' });
    await expect(service.createTopic('ws-1', 'u-1', 'g-1', '14')).rejects.toMatchObject({ code: 'CREATE_UNKNOWN' });
    expect(telegram.createForumTopic).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE telegram_forum_topics SET status=?'), ['CREATE_UNKNOWN', expect.any(Number), expect.any(String)]);
  });

  it('crea invitación con solicitud de ingreso sólo para un usuario Telegram vinculado', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.includes('FROM workspace_members')) return [{ id: 'u-2', name: 'Luis', email: 'luis@example.com', telegram_user_id: '9002', status: null }];
      return { affectedRows: 1 };
    });
    const participant = await service.createParticipantInvite('ws-1', 'u-1', 'g-1', 'u-2');
    expect(telegram.createChatInviteLink).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-1001', name: 'Joinpoint · Luis' }));
    expect(participant).toMatchObject({ userId: 'u-2', telegramUserId: '9002', status: 'INVITE_PENDING', inviteLink: 'https://t.me/+individual' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO telegram_forum_participants'), expect.arrayContaining(['u-2', '9002', 'https://t.me/+individual']));
  });

  it('aprueba ingreso sólo cuando coinciden usuario, enlace y vigencia', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.includes('FROM telegram_forum_participants')) return [{ id: 'p-1', telegram_user_id: '9002', invite_link: 'https://t.me/+individual', invite_expires_at: Date.now() + 60_000, acted_by: 'u-1' }];
      return { affectedRows: 1 };
    });
    const handled = await service.reconcileParticipantUpdate({ workspaceId: 'ws-1', botToken: '123456:token', update: { chat_join_request: { chat: { id: -1001 }, from: { id: 9002 }, invite_link: { invite_link: 'https://t.me/+individual' } } } });
    expect(handled).toBe(true);
    expect(telegram.approveChatJoinRequest).toHaveBeenCalledWith(expect.objectContaining({ userId: '9002' }));
    expect(telegram.declineChatJoinRequest).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='ACTIVE'"), expect.arrayContaining(['p-1']));
  });

  it('rechaza solicitudes que no corresponden a una invitación conocida', async () => {
    query.mockImplementation(async sql => sql.includes('FROM telegram_forum_groups') ? [group] : []);
    await service.reconcileParticipantUpdate({ workspaceId: 'ws-1', botToken: '123456:token', update: { chat_join_request: { chat: { id: -1001 }, from: { id: 9999 }, invite_link: { invite_link: 'https://t.me/+reenviada' } } } });
    expect(telegram.declineChatJoinRequest).toHaveBeenCalledWith(expect.objectContaining({ userId: '9999' }));
    expect(telegram.approveChatJoinRequest).not.toHaveBeenCalled();
  });

  it('resuelve tema a cliente sólo para un participante activo conocido', async () => {
    query.mockImplementation(async sql => sql.includes('SELECT t.client_external_id') ? [{ client_external_id: '14' }] : []);
    const result = await service.clientForTopicCommand('ws-1', { chat: { id: -1001 }, from: { id: 9002 }, message_thread_id: 77 });
    expect(result).toMatchObject({ id: '14', name: 'Ana Pérez' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("p.status='ACTIVE'"), ['ws-1', '-1001', '77', '9002']);
    expect(integrations.getMikrowispClient).toHaveBeenCalledWith('ws-1', '14');
  });

  it('niega consultas fuera de tema o sin participante activo', async () => {
    await expect(service.topicContextForCommand('ws-1', { chat: { id: -1001 }, from: { id: 9002 } })).rejects.toMatchObject({ code: 'TELEGRAM_TOPIC_CONTEXT_REQUIRED' });
    query.mockResolvedValue([]);
    await expect(service.topicContextForCommand('ws-1', { chat: { id: -1001 }, from: { id: 9002 }, message_thread_id: 77 })).rejects.toMatchObject({ code: 'TELEGRAM_TOPIC_ACCESS_DENIED' });
  });
});
