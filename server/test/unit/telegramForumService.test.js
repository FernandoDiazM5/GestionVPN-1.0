import { beforeEach, describe, expect, it, vi } from 'vitest';
const { stubModule } = require('../helpers/moduleMock');

const query = vi.fn();
const integrations = { getSecret: vi.fn(), getMikrowispClient: vi.fn() };
const telegram = { createForumTopic: vi.fn(), editForumTopic: vi.fn(), closeForumTopic: vi.fn(), reopenForumTopic: vi.fn(), deleteForumTopic: vi.fn(), sendChatAction: vi.fn(), getChat: vi.fn(), getChatMember: vi.fn(), callBotApi: vi.fn(), createChatInviteLink: vi.fn(), revokeChatInviteLink: vi.fn(), approveChatJoinRequest: vi.fn(), declineChatJoinRequest: vi.fn(), banChatMember: vi.fn(), unbanChatMember: vi.fn() };
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
  telegram.editForumTopic.mockResolvedValue({ ok: true, result: true });
  telegram.deleteForumTopic.mockResolvedValue({ ok: true, result: true });
  telegram.sendChatAction.mockResolvedValue({ ok: true, result: true });
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

  it('registra como participante activo al moderador que vincula el grupo', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM notification_subscriptions')) return [{ id: 'u-1' }];
      if (sql.includes("status='PENDING_LINK'")) return [{ id: 'g-1', workspace_id: 'ws-1', created_at: 1, link_code_expires_at: Date.now() + 60_000 }];
      return { affectedRows: 1 };
    });
    telegram.getChat.mockResolvedValue({ ok: true, result: { type: 'supergroup', is_forum: true, title: 'Clientes piloto' } });
    telegram.callBotApi.mockResolvedValue({ ok: true, result: { id: 7001 } });
    telegram.getChatMember.mockResolvedValue({ ok: true, result: { status: 'administrator', can_manage_topics: true, can_invite_users: true, can_restrict_members: true } });
    const result = await service.confirmGroupLink({ workspaceId: 'ws-1', botToken: '123456:valid-token-for-tests-abcdef', message: { chat: { id: -1001 }, from: { id: 9002 } }, code: 'A1B2C3D4' });
    expect(result).toMatchObject({ id: 'g-1', status: 'ACTIVE' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO telegram_forum_participants'), expect.arrayContaining(['ws-1', 'g-1', 'u-1', '9002']));
  });

  it('vincula el grupo y expone permisos faltantes del bot para corregirlos después', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM notification_subscriptions')) return [{ id: 'u-1' }];
      if (sql.includes("status='PENDING_LINK'")) return [{ id: 'g-1', workspace_id: 'ws-1', created_at: 1, profile_type: 'CLIENT_TRACKING', capabilities_json: '["CLIENT_TOPICS","PARTICIPANT_MANAGEMENT"]', link_code_expires_at: Date.now() + 60_000 }];
      return { affectedRows: 1 };
    });
    telegram.getChat.mockResolvedValue({ ok: true, result: { type: 'supergroup', is_forum: true, title: 'Clientes piloto' } });
    telegram.callBotApi.mockResolvedValue({ ok: true, result: { id: 7001 } });
    telegram.getChatMember.mockResolvedValue({ ok: true, result: { status: 'administrator', can_manage_topics: true, can_invite_users: false, can_restrict_members: false } });
    const result = await service.confirmGroupLink({ workspaceId: 'ws-1', botToken: '123456:valid-token-for-tests-abcdef', message: { chat: { id: -1001 }, from: { id: 9002 } }, code: 'A1B2C3D4' });
    expect(result).toMatchObject({ status: 'MISSING_PERMISSIONS', missingPermissions: ['Invitar usuarios', 'Restringir usuarios'], chatId: '-1001' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('telegram_chat_id=?'), expect.arrayContaining(['-1001', 'Clientes piloto', 'MISSING_PERMISSIONS']));
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

  it('elimina el tema en Telegram y conserva el registro como DELETED', async () => {
    const topic = { id: 't-1', group_id: 'g-1', workspace_id: 'ws-1', client_external_id: '14', client_name: 'Ana Pérez', topic_name: '14 · Ana Pérez', telegram_thread_id: '77', status: 'ACTIVE', created_at: 1, updated_at: 1 };
    query.mockImplementation(async sql => {
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.includes('FROM telegram_forum_topics')) return [topic];
      return { affectedRows: 1 };
    });
    const result = await service.deleteTopic('ws-1', 'u-1', 'g-1', 't-1');
    expect(telegram.deleteForumTopic).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-1001', threadId: '77' }));
    expect(result.status).toBe('DELETED');
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='DELETED'"), [expect.any(Number), 't-1']);
  });

  it('no da por eliminado un tema cuando Telegram rechaza el borrado', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.includes('FROM telegram_forum_topics')) return [{ id: 't-1', telegram_thread_id: '77', status: 'ACTIVE' }];
      return { affectedRows: 1 };
    });
    telegram.deleteForumTopic.mockResolvedValue({ ok: false, definite: true, error: 'not enough rights' });
    await expect(service.deleteTopic('ws-1', 'u-1', 'g-1', 't-1')).rejects.toMatchObject({ code: 'TELEGRAM_TOPIC_DELETE_FAILED' });
    expect(query.mock.calls.some(([sql]) => sql.includes("SET status='DELETED'"))).toBe(false);
  });

  it.each(['DELETED', 'ACTIVE'])('TOPIC_ID_INVALID definitivo reconcilia un tema ausente: %s', async status => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.includes('FROM telegram_forum_topics')) return [{ id: 't-1', telegram_thread_id: '77', status }];
      return { affectedRows: 1 };
    });
    telegram.deleteForumTopic.mockResolvedValue({ ok: false, status: 400, definite: true, error: 'Bad Request: TOPIC_ID_INVALID' });
    await expect(service.deleteTopic('ws-1', 'u-1', 'g-1', 't-1')).resolves.toMatchObject({ status: 'DELETED' });
  });

  it('comprueba también en Telegram un registro marcado como eliminado', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.includes('FROM telegram_forum_topics')) return [{ id: 't-1', telegram_thread_id: '77', status: 'DELETED' }];
      return { affectedRows: 1 };
    });
    await service.deleteTopic('ws-1', 'u-1', 'g-1', 't-1');
    expect(telegram.deleteForumTopic).toHaveBeenCalledWith(expect.objectContaining({ threadId: '77' }));
  });

  it('detecta durante la reconciliación un tema eliminado directamente en Telegram', async () => {
    const topic = { id: 't-1', telegram_thread_id: '77', status: 'ACTIVE' };
    query.mockImplementation(async sql => {
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.includes('FROM telegram_forum_topics')) return [topic];
      return { affectedRows: 1 };
    });
    telegram.getChat.mockResolvedValue({ ok: true, result: { type: 'supergroup', is_forum: true, title: 'Clientes actualizado' } });
    telegram.callBotApi.mockResolvedValue({ ok: true, result: { id: 7001 } });
    telegram.getChatMember.mockResolvedValue({ ok: true, result: { status: 'administrator', can_manage_topics: true, can_invite_users: true, can_restrict_members: true } });
    telegram.sendChatAction.mockResolvedValue({ ok: false, definite: true, error: 'Bad Request: message thread not found' });
    const result = await service.reconcileGroup('ws-1', 'u-1', 'g-1');
    expect(result).toMatchObject({ deletedTopics: 1, group: { name: 'Clientes actualizado', status: 'ACTIVE' } });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='DELETED'"), [expect.any(Number), 't-1']);
  });

  it('actualiza el nombre cuando Telegram notifica que un tema fue renombrado', async () => {
    const handled = await service.reconcileTopicEvent({ workspaceId: 'ws-1', message: { chat: { id: -1001 }, message_thread_id: 77, forum_topic_edited: { name: '14 · Ana Actualizada' } } });
    expect(handled).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SET t.topic_name=?'), ['14 · Ana Actualizada', expect.any(Number), 'ws-1', '-1001', '77']);
  });

  it('registra como no vinculado un tema creado directamente en Telegram', async () => {
    const handled = await service.reconcileTopicEvent({ workspaceId: 'ws-1', message: { chat: { id: -1001 }, message_thread_id: 88, forum_topic_created: { name: 'Consulta manual' } } });
    expect(handled).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("'UNREGISTERED'"), expect.arrayContaining(['ws-1', 'g-1', 'UNREGISTERED:88', 'Sin registrar', 'Consulta manual', '88']));
  });

  it('ignora la carrera si la creación controlada registró el mismo hilo antes del INSERT', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.startsWith('SELECT id FROM telegram_forum_topics')) return [];
      if (sql.includes('INSERT INTO telegram_forum_topics')) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      return { affectedRows: 1 };
    });
    await expect(service.reconcileTopicEvent({ workspaceId: 'ws-1', message: { chat: { id: -1001 }, message_thread_id: 88, forum_topic_created: { name: '14 · Ana' } } })).resolves.toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('telegram_forum_audit'))).toBe(false);
  });

  it('convierte el tema descubierto en un tema de cliente sin duplicar el hilo', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM notification_subscriptions')) return [{ id: 'u-1' }];
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.includes("status='UNREGISTERED'")) return [{ id: 't-manual', created_at: 10 }];
      return { affectedRows: 1 };
    });
    const topic = await service.registerExistingTopic({ workspaceId: 'ws-1', botToken: '123456:valid-token-for-tests-abcdef', message: { chat: { id: -1001 }, from: { id: 9002 }, message_thread_id: 88 }, clientId: '14' });
    expect(topic).toMatchObject({ id: 't-manual', clientId: '14', status: 'ACTIVE' });
    expect(telegram.editForumTopic).toHaveBeenCalledWith(expect.objectContaining({ chatId: '-1001', threadId: 88, name: '14 · Ana Pérez' }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='ACTIVE'"), ['14', 'Ana Pérez', '14 · Ana Pérez', 'u-1', expect.any(Number), 't-manual']);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO telegram_forum_topics'))).toBe(false);
  });

  it('mantiene sin autorización al usuario agregado directamente al grupo', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('FROM telegram_forum_groups')) return [group];
      if (sql.includes('FROM notification_subscriptions')) return [{ id: 'u-2', participant_id: null, status: null }];
      return { affectedRows: 1 };
    });
    await service.reconcileParticipantUpdate({ workspaceId: 'ws-1', botToken: '123456:valid-token-for-tests-abcdef', update: { chat_member: { chat: { id: -1001 }, new_chat_member: { user: { id: 9003 }, status: 'member' } } } });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("'PRESENT_UNAUTHORIZED'"), expect.arrayContaining(['ws-1', 'g-1', 'u-2', '9003']));
  });

  it('vence invitaciones pendientes antes de listar participantes', async () => {
    query.mockImplementation(async sql => {
      if (sql.includes('telegram_forum_groups')) return [group];
      if (sql.includes('FROM workspace_members')) return [];
      return { affectedRows: 1 };
    });
    await service.listParticipants('ws-1', 'g-1');
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='INVITE_EXPIRED'"), [expect.any(Number), 'ws-1', 'g-1', expect.any(Number)]);
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
