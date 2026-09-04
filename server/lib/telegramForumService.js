const crypto = require('crypto');
const { query, withTransaction } = require('../db/mysql');
const integrations = require('./workspaceIntegrationService');
const telegram = require('./telegram');
const { AppError } = require('./apiResponse');

const LINK_TTL_MS = 15 * 60 * 1000;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const GROUP_PROFILES = Object.freeze({
  CLIENT_TRACKING: ['CLIENT_QUERIES', 'CLIENT_TOPICS', 'PARTICIPANT_MANAGEMENT'],
  FIBER_ROUTES: ['FIBER_ROUTES'],
  GENERAL: [],
});
const managedTopicThreads = new Set();
const hashCode = code => crypto.createHash('sha256').update(String(code).toUpperCase()).digest('hex');
function rememberManagedThread(chatId, threadId) {
  const key = `${chatId}:${threadId}`;
  managedTopicThreads.add(key);
  const timer = setTimeout(() => managedTopicThreads.delete(key), 60_000);
  timer.unref?.();
}

function clean(value, max = 255) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function publicGroup(row) {
  let missingPermissions = [];
  try { missingPermissions = JSON.parse(row.missing_permissions_json || '[]'); } catch (_) { /* histórico */ }
  let capabilities = GROUP_PROFILES.CLIENT_TRACKING;
  try { capabilities = JSON.parse(row.capabilities_json || JSON.stringify(capabilities)); } catch (_) { /* histórico */ }
  return { id: row.id, chatId: row.telegram_chat_id, name: row.display_name, status: row.status, profileType: row.profile_type || 'CLIENT_TRACKING', capabilities, missingPermissions, linkedAt: row.linked_at ? Number(row.linked_at) : null, createdAt: Number(row.created_at) };
}
function publicTopic(row) {
  return { id: row.id, groupId: row.group_id, clientId: row.client_external_id, clientName: row.client_name, name: row.topic_name, threadId: row.telegram_thread_id, status: row.status, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) };
}
function isMissingTopic(result) {
  if (result?.ok || result?.ambiguous) return false;
  return /(message thread not found|topic.*(?:deleted|not found)|thread.*(?:deleted|not found))/i.test(String(result?.error || ''));
}
function botPermissions(member, capabilities = GROUP_PROFILES.CLIENT_TRACKING) {
  const permissions = member || {};
  const missing = [];
  if (!['administrator', 'creator'].includes(permissions.status)) missing.push('Administrador');
  if (permissions.status !== 'creator' && !permissions.can_manage_topics) missing.push('Administrar temas');
  if (capabilities.includes('PARTICIPANT_MANAGEMENT') && permissions.status !== 'creator' && !permissions.can_invite_users) missing.push('Invitar usuarios');
  if (capabilities.includes('PARTICIPANT_MANAGEMENT') && permissions.status !== 'creator' && !permissions.can_restrict_members) missing.push('Restringir usuarios');
  return missing;
}
function publicParticipant(row) {
  return {
    id: row.id || null, userId: row.user_id, name: row.user_name || row.name || null,
    email: row.email || null, role: row.role || null, telegramLinked: Boolean(row.telegram_user_id),
    telegramUserId: row.telegram_user_id || null, status: row.status || 'NOT_INVITED',
    inviteLink: row.status === 'INVITE_PENDING' ? row.invite_link || null : null,
    inviteExpiresAt: row.invite_expires_at ? Number(row.invite_expires_at) : null,
    joinedAt: row.joined_at ? Number(row.joined_at) : null,
    removedAt: row.removed_at ? Number(row.removed_at) : null,
  };
}
async function audit({ workspaceId, userId, action, entityType, entityId, result, detail = null }) {
  await query(`INSERT INTO telegram_forum_audit (id,workspace_id,actor_user_id,action,entity_type,entity_id,result,detail,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), workspaceId, userId, action, entityType, entityId, result, detail ? clean(detail, 512) : null, Date.now()]);
}
async function listGroups(workspaceId) {
  const now = Date.now();
  await query("UPDATE telegram_forum_groups SET status='EXPIRED',link_code_hash=NULL,updated_at=? WHERE workspace_id=? AND status='PENDING_LINK' AND link_code_expires_at<?", [now, workspaceId, now]);
  const rows = await query(`SELECT g.*,p.profile_type,p.capabilities_json FROM telegram_forum_groups g
    LEFT JOIN telegram_group_profiles p ON p.group_id=g.id
    WHERE g.workspace_id=? AND g.status<>'EXPIRED' ORDER BY g.created_at DESC`, [workspaceId]);
  return rows.map(publicGroup);
}
async function createLinkCode(workspaceId, userId, requestedProfile = 'CLIENT_TRACKING') {
  const profileType = String(requestedProfile || '').toUpperCase();
  const capabilities = GROUP_PROFILES[profileType];
  if (!capabilities) throw new AppError('Tipo de grupo no permitido', 422, 'TELEGRAM_GROUP_PROFILE_INVALID');
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  const id = crypto.randomUUID(); const now = Date.now();
  await withTransaction(async tx => {
    await tx.query(`INSERT INTO telegram_forum_groups
      (id,workspace_id,status,link_code_hash,link_code_expires_at,linked_by,created_at,updated_at)
      VALUES (?,?,'PENDING_LINK',?,?,?,?,?)`, [id, workspaceId, hashCode(code), now + LINK_TTL_MS, userId, now, now]);
    await tx.query(`INSERT INTO telegram_group_profiles (group_id,workspace_id,profile_type,capabilities_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?)`, [id, workspaceId, profileType, JSON.stringify(capabilities), now, now]);
  });
  await audit({ workspaceId, userId, action: 'GROUP_LINK_STARTED', entityType: 'GROUP', entityId: id, result: 'SUCCESS' });
  return { id, code, profileType, capabilities, expiresAt: now + LINK_TTL_MS, command: `/vinculargrupo ${code}` };
}
async function ownerForTelegramUser(workspaceId, telegramUserId, token) {
  const fingerprint = crypto.createHash('sha256').update(token).digest('hex');
  const rows = await query(`SELECT u.id FROM notification_subscriptions n
    JOIN users u ON u.id=n.user_id AND u.deleted_at IS NULL
    JOIN workspace_members wm ON wm.user_id=u.id AND wm.workspace_id=? AND wm.role='OWNER' AND wm.deleted_at IS NULL
    WHERE n.telegram_chat_id=? AND n.telegram_bot_fingerprint=? LIMIT 1`, [workspaceId, String(telegramUserId), fingerprint]);
  return rows[0]?.id || null;
}
async function confirmGroupLink({ workspaceId, botToken, message, code }) {
  const userId = await ownerForTelegramUser(workspaceId, message?.from?.id, botToken);
  if (!userId) throw new AppError('Sólo un moderador vinculado puede enlazar el grupo', 403, 'TELEGRAM_GROUP_OWNER_REQUIRED');
  const rows = await query(`SELECT g.*,p.profile_type,p.capabilities_json FROM telegram_forum_groups g
    LEFT JOIN telegram_group_profiles p ON p.group_id=g.id
    WHERE g.workspace_id=? AND g.link_code_hash=? AND g.status='PENDING_LINK' LIMIT 1`, [workspaceId, hashCode(code)]);
  const pending = rows[0];
  if (!pending || Number(pending.link_code_expires_at) < Date.now()) {
    if (pending) await query("UPDATE telegram_forum_groups SET status='EXPIRED',link_code_hash=NULL,updated_at=? WHERE id=?", [Date.now(), pending.id]);
    throw new AppError('El código no existe o venció', 404, 'TELEGRAM_GROUP_CODE_INVALID');
  }
  const chatId = String(message.chat.id);
  const chatResult = await telegram.getChat({ token: botToken, chatId });
  if (!chatResult.ok || chatResult.result?.type !== 'supergroup' || chatResult.result?.is_forum !== true) throw new AppError('El chat debe ser un supergrupo con temas activados', 422, 'TELEGRAM_FORUM_REQUIRED');
  const me = await telegram.callBotApi({ token: botToken, method: 'getMe' });
  if (!me.ok) throw new AppError('No se pudo verificar el bot', 422, 'TELEGRAM_BOT_VALIDATION_FAILED');
  const member = await telegram.getChatMember({ token: botToken, chatId, userId: me.result.id });
  let capabilities = GROUP_PROFILES.CLIENT_TRACKING;
  try { capabilities = JSON.parse(pending.capabilities_json || JSON.stringify(capabilities)); } catch (_) { /* histórico */ }
  const missing = botPermissions(member.result, capabilities);
  const linkedStatus = missing.length ? 'MISSING_PERMISSIONS' : 'ACTIVE';
  try {
    await query(`UPDATE telegram_forum_groups SET telegram_chat_id=?,display_name=?,status=?,missing_permissions_json=?,link_code_hash=NULL,link_code_expires_at=NULL,linked_by=?,linked_at=?,updated_at=? WHERE id=? AND workspace_id=?`,
      [chatId, clean(chatResult.result.title || message.chat.title || 'Grupo Telegram'), linkedStatus, JSON.stringify(missing), userId, Date.now(), Date.now(), pending.id, workspaceId]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AppError('Este grupo ya está vinculado', 409, 'TELEGRAM_GROUP_ALREADY_LINKED');
    throw error;
  }
  await query("UPDATE telegram_forum_groups SET status='EXPIRED',link_code_hash=NULL,updated_at=? WHERE workspace_id=? AND linked_by=? AND status='PENDING_LINK' AND id<>?", [Date.now(), workspaceId, userId, pending.id]);
  const now = Date.now();
  await query(`INSERT INTO telegram_forum_participants
    (id,workspace_id,group_id,user_id,telegram_user_id,status,acted_by,joined_at,created_at,updated_at)
    VALUES (?,?,?,?,?,'ACTIVE',?,?,?,?)
    ON DUPLICATE KEY UPDATE telegram_user_id=VALUES(telegram_user_id),status='ACTIVE',invite_link=NULL,invite_expires_at=NULL,acted_by=VALUES(acted_by),joined_at=COALESCE(joined_at,VALUES(joined_at)),removed_at=NULL,updated_at=VALUES(updated_at)`,
  [crypto.randomUUID(), workspaceId, pending.id, userId, String(message.from.id), userId, now, now, now]);
  await audit({ workspaceId, userId, action: 'GROUP_LINKED', entityType: 'GROUP', entityId: pending.id, result: 'SUCCESS' });
  return { ...publicGroup({ ...pending, telegram_chat_id: chatId, display_name: chatResult.result.title, status: linkedStatus, missing_permissions_json: JSON.stringify(missing), linked_at: Date.now() }) };
}
async function groupRow(workspaceId, groupId) {
  const rows = await query("SELECT * FROM telegram_forum_groups WHERE id=? AND workspace_id=? AND status='ACTIVE' LIMIT 1", [groupId, workspaceId]);
  if (!rows[0]) throw new AppError('Grupo Telegram no encontrado o inactivo', 404, 'TELEGRAM_GROUP_NOT_FOUND');
  return rows[0];
}
async function anyGroupRow(workspaceId, groupId) {
  const rows = await query('SELECT * FROM telegram_forum_groups WHERE id=? AND workspace_id=? AND telegram_chat_id IS NOT NULL LIMIT 1', [groupId, workspaceId]);
  if (!rows[0]) throw new AppError('Grupo Telegram no encontrado', 404, 'TELEGRAM_GROUP_NOT_FOUND');
  return rows[0];
}
async function botConfig(workspaceId) {
  const config = await integrations.getSecret(workspaceId, 'TELEGRAM');
  if (!config?.botToken) throw new AppError('Configura primero el bot Telegram del workspace', 404, 'INTEGRATION_NOT_CONFIGURED');
  return config;
}
async function groupCapabilities(groupId) {
  const rows = await query('SELECT profile_type,capabilities_json FROM telegram_group_profiles WHERE group_id=? LIMIT 1', [groupId]);
  if (!rows[0]) return { profileType: 'CLIENT_TRACKING', capabilities: GROUP_PROFILES.CLIENT_TRACKING };
  let capabilities = GROUP_PROFILES[rows[0].profile_type] || [];
  try { capabilities = JSON.parse(rows[0].capabilities_json || JSON.stringify(capabilities)); } catch (_) { /* conservar perfil */ }
  return { profileType: rows[0].profile_type, capabilities };
}
async function requireCapability(groupId, capability) {
  const profile = await groupCapabilities(groupId);
  if (!profile.capabilities.includes(capability)) throw new AppError('Esta función no está habilitada para el grupo', 403, 'TELEGRAM_GROUP_CAPABILITY_REQUIRED');
  return profile;
}
async function previewTopic(workspaceId, groupId, clientId) {
  await groupRow(workspaceId, groupId);
  await requireCapability(groupId, 'CLIENT_TOPICS');
  const client = await integrations.getMikrowispClient(workspaceId, clientId);
  const id = client.id;
  const prefix = `${id} · `;
  const name = clean(client.name, Math.max(1, 128 - prefix.length));
  return { client, topicName: `${prefix}${name}`.slice(0, 128) };
}
async function listTopics(workspaceId, groupId) {
  await anyGroupRow(workspaceId, groupId);
  const rows = await query('SELECT * FROM telegram_forum_topics WHERE workspace_id=? AND group_id=? ORDER BY created_at DESC', [workspaceId, groupId]);
  return rows.map(publicTopic);
}
async function createTopic(workspaceId, userId, groupId, clientId) {
  const group = await groupRow(workspaceId, groupId);
  const { client, topicName } = await previewTopic(workspaceId, groupId, clientId);
  const id = crypto.randomUUID(); const now = Date.now();
  try {
    await query(`INSERT INTO telegram_forum_topics (id,workspace_id,group_id,client_external_id,client_name,topic_name,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'CREATING',?,?,?)`, [id, workspaceId, groupId, client.id, client.name, topicName, userId, now, now]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AppError('Este cliente ya tiene un tema registrado en el grupo', 409, 'TELEGRAM_TOPIC_ALREADY_EXISTS');
    throw error;
  }
  const config = await botConfig(workspaceId);
  const created = await telegram.createForumTopic({ token: config.botToken, chatId: group.telegram_chat_id, name: topicName });
  if (!created.ok) {
    const status = created.ambiguous ? 'CREATE_UNKNOWN' : 'REPAIR_REQUIRED';
    await query('UPDATE telegram_forum_topics SET status=?,updated_at=? WHERE id=?', [status, Date.now(), id]);
    await audit({ workspaceId, userId, action: 'TOPIC_CREATE', entityType: 'TOPIC', entityId: id, result: status, detail: created.error });
    throw new AppError(created.ambiguous ? 'Telegram no confirmó la creación. No se reintentará automáticamente.' : 'Telegram rechazó la creación del tema', 502, status);
  }
  rememberManagedThread(group.telegram_chat_id, created.result.message_thread_id);
  await query("UPDATE telegram_forum_topics SET telegram_thread_id=?,status='ACTIVE',updated_at=? WHERE id=?", [String(created.result.message_thread_id), Date.now(), id]);
  await audit({ workspaceId, userId, action: 'TOPIC_CREATE', entityType: 'TOPIC', entityId: id, result: 'SUCCESS' });
  return publicTopic({ id, workspace_id: workspaceId, group_id: groupId, client_external_id: client.id, client_name: client.name, topic_name: topicName, telegram_thread_id: String(created.result.message_thread_id), status: 'ACTIVE', created_at: now, updated_at: Date.now() });
}
async function registerExistingTopic({ workspaceId, botToken, message, clientId }) {
  const userId = await ownerForTelegramUser(workspaceId, message?.from?.id, botToken);
  if (!userId) throw new AppError('Sólo un moderador vinculado puede registrar temas', 403, 'TELEGRAM_GROUP_OWNER_REQUIRED');
  const groups = await query("SELECT * FROM telegram_forum_groups WHERE workspace_id=? AND telegram_chat_id=? AND status='ACTIVE' LIMIT 1", [workspaceId, String(message.chat.id)]);
  const group = groups[0];
  if (!group || !message.message_thread_id) throw new AppError('Ejecuta el comando dentro de un tema de un grupo vinculado', 422, 'TELEGRAM_TOPIC_CONTEXT_REQUIRED');
  await requireCapability(group.id, 'CLIENT_TOPICS');
  const client = await integrations.getMikrowispClient(workspaceId, clientId);
  const prefix = `${client.id} · `;
  const topicName = `${prefix}${clean(client.name, Math.max(1, 128 - prefix.length))}`.slice(0, 128);
  const id = crypto.randomUUID(); const now = Date.now();
  const existing = await query("SELECT * FROM telegram_forum_topics WHERE workspace_id=? AND group_id=? AND telegram_thread_id=? AND status='UNREGISTERED' LIMIT 1", [workspaceId, group.id, String(message.message_thread_id)]);
  if (existing[0]) {
    const renamed = await telegram.editForumTopic({ token: botToken, chatId: group.telegram_chat_id, threadId: message.message_thread_id, name: topicName });
    if (!renamed.ok) throw new AppError(renamed.ambiguous ? 'Telegram no confirmó el nombre del tema. Vuelve a intentarlo antes de registrarlo.' : 'Telegram rechazó el nuevo nombre del tema', 502, 'TELEGRAM_TOPIC_RENAME_FAILED');
  }
  try {
    if (existing[0]) {
      await query("UPDATE telegram_forum_topics SET client_external_id=?,client_name=?,topic_name=?,status='ACTIVE',created_by=?,updated_at=? WHERE id=?", [client.id, client.name, topicName, userId, now, existing[0].id]);
    } else {
      await query(`INSERT INTO telegram_forum_topics (id,workspace_id,group_id,client_external_id,client_name,topic_name,telegram_thread_id,status,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?,?)`, [id, workspaceId, group.id, client.id, client.name, topicName, String(message.message_thread_id), userId, now, now]);
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AppError('Este cliente ya tiene un tema registrado en el grupo', 409, 'TELEGRAM_TOPIC_ALREADY_EXISTS');
    throw error;
  }
  const topicId = existing[0]?.id || id;
  await audit({ workspaceId, userId, action: 'TOPIC_REGISTERED', entityType: 'TOPIC', entityId: topicId, result: 'SUCCESS' });
  return publicTopic({ id: topicId, group_id: group.id, client_external_id: client.id, client_name: client.name, topic_name: topicName, telegram_thread_id: String(message.message_thread_id), status: 'ACTIVE', created_at: existing[0]?.created_at || now, updated_at: now });
}
async function reconcileTopicEvent({ workspaceId, message }) {
  if (!message?.chat?.id || !message.message_thread_id) return false;
  if (message.forum_topic_created?.name) {
    const groups = await query("SELECT * FROM telegram_forum_groups WHERE workspace_id=? AND telegram_chat_id=? AND status='ACTIVE' LIMIT 1", [workspaceId, String(message.chat.id)]);
    const group = groups[0];
    if (!group) return false;
    const threadId = String(message.message_thread_id);
    if (managedTopicThreads.has(`${message.chat.id}:${threadId}`)) return true;
    const rows = await query('SELECT id FROM telegram_forum_topics WHERE workspace_id=? AND group_id=? AND telegram_thread_id=? LIMIT 1', [workspaceId, group.id, threadId]);
    if (rows[0]) return true;
    const now = Date.now();
    const id = crypto.randomUUID();
    await query(`INSERT INTO telegram_forum_topics (id,workspace_id,group_id,client_external_id,client_name,topic_name,telegram_thread_id,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'UNREGISTERED',?,?,?)`, [id, workspaceId, group.id, `UNREGISTERED:${threadId}`, 'Sin registrar', clean(message.forum_topic_created.name, 128), threadId, group.linked_by, now, now]);
    await audit({ workspaceId, userId: group.linked_by, action: 'TOPIC_DISCOVERED', entityType: 'TOPIC', entityId: id, result: 'UNREGISTERED' });
    return true;
  }
  let status = null;
  if (message.forum_topic_closed) status = 'CLOSED';
  if (message.forum_topic_reopened) status = 'ACTIVE';
  if (message.forum_topic_edited?.name) {
    await query(`UPDATE telegram_forum_topics t JOIN telegram_forum_groups g ON g.id=t.group_id
      SET t.topic_name=?,t.updated_at=? WHERE t.workspace_id=? AND g.telegram_chat_id=? AND t.telegram_thread_id=? AND t.status NOT IN ('DELETED','DELETING','DELETE_UNKNOWN')`,
    [clean(message.forum_topic_edited.name, 128), Date.now(), workspaceId, String(message.chat.id), String(message.message_thread_id)]);
    return true;
  }
  if (!status) return false;
  await query(`UPDATE telegram_forum_topics t JOIN telegram_forum_groups g ON g.id=t.group_id
    SET t.status=?,t.updated_at=? WHERE t.workspace_id=? AND g.telegram_chat_id=? AND t.telegram_thread_id=? AND t.status NOT IN ('DELETED','DELETING','DELETE_UNKNOWN')`,
  [status, Date.now(), workspaceId, String(message.chat.id), String(message.message_thread_id)]);
  return true;
}
async function changeTopicState(workspaceId, userId, groupId, topicId, action) {
  const group = await groupRow(workspaceId, groupId);
  const rows = await query('SELECT * FROM telegram_forum_topics WHERE id=? AND group_id=? AND workspace_id=? LIMIT 1', [topicId, groupId, workspaceId]);
  const topic = rows[0];
  if (!topic?.telegram_thread_id) throw new AppError('El tema requiere reparación antes de operar', 409, 'TELEGRAM_TOPIC_REPAIR_REQUIRED');
  const config = await botConfig(workspaceId);
  const fn = action === 'close' ? telegram.closeForumTopic : telegram.reopenForumTopic;
  const result = await fn({ token: config.botToken, chatId: group.telegram_chat_id, threadId: topic.telegram_thread_id });
  if (!result.ok) {
    if (isMissingTopic(result)) {
      const now = Date.now();
      await query("UPDATE telegram_forum_topics SET status='DELETED',updated_at=? WHERE id=?", [now, topicId]);
      await audit({ workspaceId, userId, action: 'TOPIC_MISSING_DETECTED', entityType: 'TOPIC', entityId: topicId, result: 'DELETED', detail: result.error });
      throw new AppError('El tema ya no existe en Telegram. Se marcó como eliminado y puede recrearse.', 409, 'TELEGRAM_TOPIC_DELETED');
    }
    await query("UPDATE telegram_forum_topics SET status='REPAIR_REQUIRED',updated_at=? WHERE id=?", [Date.now(), topicId]);
    throw new AppError('Telegram no confirmó la operación; el tema requiere revisión', 502, 'TELEGRAM_TOPIC_REPAIR_REQUIRED');
  }
  const status = action === 'close' ? 'CLOSED' : 'ACTIVE';
  await query('UPDATE telegram_forum_topics SET status=?,updated_at=? WHERE id=?', [status, Date.now(), topicId]);
  await audit({ workspaceId, userId, action: action === 'close' ? 'TOPIC_CLOSED' : 'TOPIC_REOPENED', entityType: 'TOPIC', entityId: topicId, result: 'SUCCESS' });
  return publicTopic({ ...topic, status, updated_at: Date.now() });
}
async function deleteTopic(workspaceId, userId, groupId, topicId) {
  const group = await groupRow(workspaceId, groupId);
  const rows = await query('SELECT * FROM telegram_forum_topics WHERE id=? AND group_id=? AND workspace_id=? LIMIT 1', [topicId, groupId, workspaceId]);
  const topic = rows[0];
  if (!topic) throw new AppError('Tema no encontrado', 404, 'TELEGRAM_TOPIC_NOT_FOUND');
  // También verificar registros históricos DELETED: no declarar éxito sin Telegram.
  if (!topic.telegram_thread_id) throw new AppError('El tema no tiene identificador de Telegram', 409, 'TELEGRAM_TOPIC_REPAIR_REQUIRED');
  const config = await botConfig(workspaceId);
  await query("UPDATE telegram_forum_topics SET status='DELETING',updated_at=? WHERE id=?", [Date.now(), topicId]);
  const result = await telegram.deleteForumTopic({ token: config.botToken, chatId: group.telegram_chat_id, threadId: topic.telegram_thread_id });
  const alreadyDeleted = !result.ok && !result.ambiguous && topic.status === 'DELETED' && /\bTOPIC_ID_INVALID\b/i.test(String(result.error || ''));
  if (!result.ok && !isMissingTopic(result) && !alreadyDeleted) {
    const status = result.ambiguous ? 'DELETE_UNKNOWN' : topic.status;
    await query('UPDATE telegram_forum_topics SET status=?,updated_at=? WHERE id=?', [status, Date.now(), topicId]);
    await audit({ workspaceId, userId, action: 'TOPIC_DELETE', entityType: 'TOPIC', entityId: topicId, result: status, detail: result.error });
    throw new AppError(result.ambiguous ? 'Telegram no confirmó la eliminación. Verifica antes de repetir.' : 'Telegram rechazó la eliminación. Verifica que el bot tenga permiso para eliminar mensajes y vuelve a intentar.', 502, 'TELEGRAM_TOPIC_DELETE_FAILED');
  }
  const now = Date.now();
  await query("UPDATE telegram_forum_topics SET status='DELETED',updated_at=? WHERE id=?", [now, topicId]);
  await audit({ workspaceId, userId, action: 'TOPIC_DELETED', entityType: 'TOPIC', entityId: topicId, result: 'SUCCESS', detail: result.ok ? null : result.error });
  return publicTopic({ ...topic, status: 'DELETED', updated_at: now });
}
async function recreateTopic(workspaceId, userId, groupId, topicId) {
  const group = await groupRow(workspaceId, groupId);
  const rows = await query('SELECT * FROM telegram_forum_topics WHERE id=? AND group_id=? AND workspace_id=? LIMIT 1', [topicId, groupId, workspaceId]);
  const topic = rows[0];
  if (!topic || !['REPAIR_REQUIRED', 'CREATE_UNKNOWN', 'DELETED', 'DELETE_UNKNOWN'].includes(topic.status)) throw new AppError('Este tema no está marcado para recreación', 409, 'TELEGRAM_TOPIC_RECREATE_NOT_ALLOWED');
  const config = await botConfig(workspaceId);
  await query("UPDATE telegram_forum_topics SET status='CREATING',updated_at=? WHERE id=?", [Date.now(), topicId]);
  const created = await telegram.createForumTopic({ token: config.botToken, chatId: group.telegram_chat_id, name: topic.topic_name });
  if (!created.ok) {
    const status = created.ambiguous ? 'CREATE_UNKNOWN' : 'REPAIR_REQUIRED';
    await query('UPDATE telegram_forum_topics SET status=?,updated_at=? WHERE id=?', [status, Date.now(), topicId]);
    throw new AppError('Telegram no confirmó la recreación', 502, status);
  }
  rememberManagedThread(group.telegram_chat_id, created.result.message_thread_id);
  await query("UPDATE telegram_forum_topics SET telegram_thread_id=?,status='ACTIVE',updated_at=? WHERE id=?", [String(created.result.message_thread_id), Date.now(), topicId]);
  await audit({ workspaceId, userId, action: 'TOPIC_RECREATED', entityType: 'TOPIC', entityId: topicId, result: 'SUCCESS' });
  return publicTopic({ ...topic, telegram_thread_id: String(created.result.message_thread_id), status: 'ACTIVE', updated_at: Date.now() });
}

async function reconcileGroup(workspaceId, userId, groupId) {
  const rows = await query(`SELECT g.*,p.profile_type,p.capabilities_json FROM telegram_forum_groups g
    LEFT JOIN telegram_group_profiles p ON p.group_id=g.id WHERE g.id=? AND g.workspace_id=? LIMIT 1`, [groupId, workspaceId]);
  const group = rows[0];
  if (!group?.telegram_chat_id) throw new AppError('Grupo Telegram no vinculado', 404, 'TELEGRAM_GROUP_NOT_FOUND');
  const config = await botConfig(workspaceId);
  const [chat, me] = await Promise.all([
    telegram.getChat({ token: config.botToken, chatId: group.telegram_chat_id }),
    telegram.callBotApi({ token: config.botToken, method: 'getMe' }),
  ]);
  let status = group.status;
  let missing = [];
  let name = group.display_name;
  if (!chat.ok) {
    if (!chat.ambiguous) status = 'BOT_REMOVED';
  } else if (chat.result?.type !== 'supergroup' || chat.result?.is_forum !== true) {
    status = 'FORUM_DISABLED';
    name = clean(chat.result?.title || name || 'Grupo Telegram');
  } else if (!me.ok) {
    status = me.ambiguous ? status : 'BOT_REMOVED';
  } else {
    name = clean(chat.result.title || name || 'Grupo Telegram');
    const member = await telegram.getChatMember({ token: config.botToken, chatId: group.telegram_chat_id, userId: me.result.id });
    if (!member.ok) status = member.ambiguous ? status : 'BOT_REMOVED';
    else {
      let capabilities = GROUP_PROFILES[group.profile_type] || GROUP_PROFILES.CLIENT_TRACKING;
      try { capabilities = JSON.parse(group.capabilities_json || JSON.stringify(capabilities)); } catch (_) { /* conservar perfil */ }
      missing = botPermissions(member.result, capabilities);
      status = missing.length ? 'MISSING_PERMISSIONS' : 'ACTIVE';
    }
  }
  await query('UPDATE telegram_forum_groups SET display_name=?,status=?,missing_permissions_json=?,updated_at=? WHERE id=?', [name, status, JSON.stringify(missing), Date.now(), groupId]);
  let deletedTopics = 0;
  if (status === 'ACTIVE') {
    const topics = await query("SELECT * FROM telegram_forum_topics WHERE workspace_id=? AND group_id=? AND telegram_thread_id IS NOT NULL AND status IN ('ACTIVE','CLOSED','DELETE_UNKNOWN')", [workspaceId, groupId]);
    for (const topic of topics) {
      const result = await telegram.sendChatAction({ token: config.botToken, chatId: group.telegram_chat_id, threadId: topic.telegram_thread_id });
      if (isMissingTopic(result)) {
        await query("UPDATE telegram_forum_topics SET status='DELETED',updated_at=? WHERE id=?", [Date.now(), topic.id]);
        deletedTopics += 1;
        await audit({ workspaceId, userId, action: 'TOPIC_MISSING_DETECTED', entityType: 'TOPIC', entityId: topic.id, result: 'DELETED', detail: result.error });
      }
    }
  }
  await audit({ workspaceId, userId, action: 'GROUP_RECONCILED', entityType: 'GROUP', entityId: groupId, result: status, detail: deletedTopics ? `${deletedTopics} tema(s) eliminado(s) detectado(s)` : null });
  return { group: publicGroup({ ...group, display_name: name, status, missing_permissions_json: JSON.stringify(missing) }), deletedTopics };
}

async function reconcileBotMembership({ workspaceId, update }) {
  const member = update?.my_chat_member;
  if (!member?.chat?.id) return false;
  const status = member.new_chat_member?.status;
  const profiles = await query(`SELECT p.profile_type,p.capabilities_json FROM telegram_forum_groups g
    LEFT JOIN telegram_group_profiles p ON p.group_id=g.id WHERE g.workspace_id=? AND g.telegram_chat_id=? LIMIT 1`, [workspaceId, String(member.chat.id)]);
  let capabilities = GROUP_PROFILES[profiles[0]?.profile_type] || GROUP_PROFILES.CLIENT_TRACKING;
  try { capabilities = JSON.parse(profiles[0]?.capabilities_json || JSON.stringify(capabilities)); } catch (_) { /* histórico */ }
  const missing = botPermissions(member.new_chat_member, capabilities);
  const groupStatus = ['left', 'kicked'].includes(status) ? 'BOT_REMOVED' : missing.length ? 'MISSING_PERMISSIONS' : 'ACTIVE';
  await query('UPDATE telegram_forum_groups SET status=?,missing_permissions_json=?,display_name=COALESCE(?,display_name),updated_at=? WHERE workspace_id=? AND telegram_chat_id=?',
    [groupStatus, JSON.stringify(missing), clean(member.chat.title || '', 255) || null, Date.now(), workspaceId, String(member.chat.id)]);
  return true;
}

async function listParticipants(workspaceId, groupId) {
  await anyGroupRow(workspaceId, groupId);
  await requireCapability(groupId, 'PARTICIPANT_MANAGEMENT');
  const now = Date.now();
  await query("UPDATE telegram_forum_participants SET status='INVITE_EXPIRED',invite_link=NULL,updated_at=? WHERE workspace_id=? AND group_id=? AND status='INVITE_PENDING' AND invite_expires_at<?", [now, workspaceId, groupId, now]);
  const config = await botConfig(workspaceId);
  const fingerprint = crypto.createHash('sha256').update(config.botToken).digest('hex');
  const rows = await query(`SELECT u.id AS user_id,u.name AS user_name,u.email,wm.role,
      CASE WHEN n.telegram_bot_fingerprint=? THEN n.telegram_chat_id ELSE NULL END AS telegram_user_id,
      p.id,p.status,p.invite_link,p.invite_expires_at,p.joined_at,p.removed_at
    FROM workspace_members wm JOIN users u ON u.id=wm.user_id AND u.deleted_at IS NULL
    LEFT JOIN notification_subscriptions n ON n.user_id=u.id
    LEFT JOIN telegram_forum_participants p ON p.group_id=? AND p.user_id=u.id
    WHERE wm.workspace_id=? AND wm.deleted_at IS NULL ORDER BY u.name,u.email`, [fingerprint, groupId, workspaceId]);
  return rows.map(publicParticipant);
}

async function createParticipantInvite(workspaceId, actorUserId, groupId, targetUserId, { reinstate = false } = {}) {
  await requireCapability(groupId, 'PARTICIPANT_MANAGEMENT');
  const group = await groupRow(workspaceId, groupId);
  const config = await botConfig(workspaceId);
  const fingerprint = crypto.createHash('sha256').update(config.botToken).digest('hex');
  const rows = await query(`SELECT u.id,u.name,u.email,n.telegram_chat_id AS telegram_user_id,p.status,p.invite_link
    FROM workspace_members wm JOIN users u ON u.id=wm.user_id AND u.deleted_at IS NULL
    JOIN notification_subscriptions n ON n.user_id=u.id AND n.telegram_bot_fingerprint=? AND n.telegram_chat_id IS NOT NULL
    LEFT JOIN telegram_forum_participants p ON p.group_id=? AND p.user_id=u.id
    WHERE wm.workspace_id=? AND wm.user_id=? AND wm.deleted_at IS NULL LIMIT 1`, [fingerprint, groupId, workspaceId, targetUserId]);
  const target = rows[0];
  if (!target) throw new AppError('El usuario debe pertenecer al workspace y vincular este bot en Telegram', 422, 'TELEGRAM_PARTICIPANT_NOT_LINKED');
  if (target.status === 'ACTIVE') throw new AppError('El usuario ya figura como miembro activo', 409, 'TELEGRAM_PARTICIPANT_ACTIVE');
  if (target.status === 'REMOVED' && !reinstate) throw new AppError('Usa reintegrar para un participante retirado', 409, 'TELEGRAM_PARTICIPANT_REINSTATE_REQUIRED');
  if (reinstate) {
    const unbanned = await telegram.unbanChatMember({ token: config.botToken, chatId: group.telegram_chat_id, userId: target.telegram_user_id });
    if (!unbanned.ok) throw new AppError('Telegram no confirmó el desbloqueo del participante', 502, 'TELEGRAM_PARTICIPANT_UNBAN_FAILED');
  }
  if (target.invite_link) await telegram.revokeChatInviteLink({ token: config.botToken, chatId: group.telegram_chat_id, inviteLink: target.invite_link }).catch(() => null);
  const expiresAt = Date.now() + INVITE_TTL_MS;
  const created = await telegram.createChatInviteLink({ token: config.botToken, chatId: group.telegram_chat_id, name: `Joinpoint · ${clean(target.name || target.email, 24)}`, expiresAt });
  if (!created.ok || !created.result?.invite_link) throw new AppError('Telegram no pudo crear la invitación individual', 502, 'TELEGRAM_PARTICIPANT_INVITE_FAILED');
  const id = crypto.randomUUID(); const now = Date.now();
  await query(`INSERT INTO telegram_forum_participants
    (id,workspace_id,group_id,user_id,telegram_user_id,status,invite_link,invite_expires_at,acted_by,created_at,updated_at)
    VALUES (?,?,?,?,?,'INVITE_PENDING',?,?,?,?,?)
    ON DUPLICATE KEY UPDATE telegram_user_id=VALUES(telegram_user_id),status='INVITE_PENDING',invite_link=VALUES(invite_link),invite_expires_at=VALUES(invite_expires_at),acted_by=VALUES(acted_by),removed_at=NULL,updated_at=VALUES(updated_at)`,
  [id, workspaceId, groupId, target.id, String(target.telegram_user_id), created.result.invite_link, expiresAt, actorUserId, now, now]);
  await audit({ workspaceId, userId: actorUserId, action: reinstate ? 'PARTICIPANT_REINVITED' : 'PARTICIPANT_INVITED', entityType: 'PARTICIPANT', entityId: target.id, result: 'SUCCESS' });
  return publicParticipant({ id, user_id: target.id, user_name: target.name, email: target.email, telegram_user_id: String(target.telegram_user_id), status: 'INVITE_PENDING', invite_link: created.result.invite_link, invite_expires_at: expiresAt });
}

async function removeParticipant(workspaceId, actorUserId, groupId, targetUserId) {
  await requireCapability(groupId, 'PARTICIPANT_MANAGEMENT');
  const group = await groupRow(workspaceId, groupId); const config = await botConfig(workspaceId);
  const rows = await query('SELECT * FROM telegram_forum_participants WHERE workspace_id=? AND group_id=? AND user_id=? LIMIT 1', [workspaceId, groupId, targetUserId]);
  const participant = rows[0];
  if (!participant) throw new AppError('Participante no registrado en este grupo', 404, 'TELEGRAM_PARTICIPANT_NOT_FOUND');
  const removed = await telegram.banChatMember({ token: config.botToken, chatId: group.telegram_chat_id, userId: participant.telegram_user_id });
  if (!removed.ok) throw new AppError('Telegram no confirmó el retiro del participante', 502, 'TELEGRAM_PARTICIPANT_REMOVE_FAILED');
  if (participant.invite_link) await telegram.revokeChatInviteLink({ token: config.botToken, chatId: group.telegram_chat_id, inviteLink: participant.invite_link }).catch(() => null);
  const now = Date.now();
  await query("UPDATE telegram_forum_participants SET status='REMOVED',invite_link=NULL,invite_expires_at=NULL,removed_at=?,acted_by=?,updated_at=? WHERE id=?", [now, actorUserId, now, participant.id]);
  await audit({ workspaceId, userId: actorUserId, action: 'PARTICIPANT_REMOVED', entityType: 'PARTICIPANT', entityId: participant.id, result: 'SUCCESS' });
  return publicParticipant({ ...participant, status: 'REMOVED', invite_link: null, invite_expires_at: null, removed_at: now });
}

async function reconcileParticipantUpdate({ workspaceId, botToken, update }) {
  const request = update?.chat_join_request;
  const memberUpdate = update?.chat_member;
  const chatId = String(request?.chat?.id ?? memberUpdate?.chat?.id ?? '');
  if (!chatId) return false;
  const groups = await query("SELECT * FROM telegram_forum_groups WHERE workspace_id=? AND telegram_chat_id=? AND status='ACTIVE' LIMIT 1", [workspaceId, chatId]);
  const group = groups[0]; if (!group) return false;
  if (request) {
    const telegramUserId = String(request.from?.id || '');
    const inviteLink = request.invite_link?.invite_link || null;
    const rows = await query("SELECT * FROM telegram_forum_participants WHERE group_id=? AND telegram_user_id=? AND status='INVITE_PENDING' LIMIT 1", [group.id, telegramUserId]);
    const participant = rows[0];
    const valid = participant && participant.invite_link === inviteLink && Number(participant.invite_expires_at) >= Date.now();
    const response = valid
      ? await telegram.approveChatJoinRequest({ token: botToken, chatId, userId: telegramUserId })
      : await telegram.declineChatJoinRequest({ token: botToken, chatId, userId: telegramUserId });
    if (valid && response.ok) {
      const now = Date.now();
      await query("UPDATE telegram_forum_participants SET status='ACTIVE',invite_link=NULL,invite_expires_at=NULL,joined_at=?,removed_at=NULL,updated_at=? WHERE id=?", [now, now, participant.id]);
      await audit({ workspaceId, userId: participant.acted_by, action: 'PARTICIPANT_JOIN_APPROVED', entityType: 'PARTICIPANT', entityId: participant.id, result: 'SUCCESS' });
    }
    return true;
  }
  const telegramUserId = String(memberUpdate.new_chat_member?.user?.id || '');
  const status = memberUpdate.new_chat_member?.status;
  if (telegramUserId && ['left', 'kicked'].includes(status)) {
    await query("UPDATE telegram_forum_participants SET status='REMOVED',removed_at=?,updated_at=? WHERE group_id=? AND telegram_user_id=?", [Date.now(), Date.now(), group.id, telegramUserId]);
  } else if (telegramUserId && ['member', 'administrator', 'creator', 'restricted'].includes(status)) {
    const fingerprint = crypto.createHash('sha256').update(botToken).digest('hex');
    const rows = await query(`SELECT u.id,p.id AS participant_id,p.status FROM notification_subscriptions n
      JOIN users u ON u.id=n.user_id AND u.deleted_at IS NULL
      JOIN workspace_members wm ON wm.user_id=u.id AND wm.workspace_id=? AND wm.deleted_at IS NULL
      LEFT JOIN telegram_forum_participants p ON p.group_id=? AND p.user_id=u.id
      WHERE n.telegram_chat_id=? AND n.telegram_bot_fingerprint=? LIMIT 1`, [workspaceId, group.id, telegramUserId, fingerprint]);
    const linked = rows[0];
    if (linked && linked.status !== 'ACTIVE') {
      const now = Date.now();
      await query(`INSERT INTO telegram_forum_participants
        (id,workspace_id,group_id,user_id,telegram_user_id,status,acted_by,created_at,updated_at)
        VALUES (?,?,?,?,?,'PRESENT_UNAUTHORIZED',?,?,?)
        ON DUPLICATE KEY UPDATE telegram_user_id=VALUES(telegram_user_id),status='PRESENT_UNAUTHORIZED',invite_link=NULL,invite_expires_at=NULL,removed_at=NULL,updated_at=VALUES(updated_at)`,
      [crypto.randomUUID(), workspaceId, group.id, linked.id, telegramUserId, group.linked_by, now, now]);
      await audit({ workspaceId, userId: group.linked_by, action: 'PARTICIPANT_EXTERNAL_ADD_DETECTED', entityType: 'PARTICIPANT', entityId: linked.id, result: 'PRESENT_UNAUTHORIZED' });
    }
  }
  return true;
}

async function topicContextForCommand(workspaceId, message) {
  if (!message?.chat?.id || !message.message_thread_id || !message?.from?.id) throw new AppError('Ejecuta el comando dentro de un tema registrado', 422, 'TELEGRAM_TOPIC_CONTEXT_REQUIRED');
  const rows = await query(`SELECT t.client_external_id,g.id AS group_id,pf.capabilities_json FROM telegram_forum_topics t
    JOIN telegram_forum_groups g ON g.id=t.group_id AND g.workspace_id=t.workspace_id
    LEFT JOIN telegram_group_profiles pf ON pf.group_id=g.id
    JOIN telegram_forum_participants p ON p.group_id=g.id AND p.workspace_id=g.workspace_id
    WHERE t.workspace_id=? AND g.telegram_chat_id=? AND t.telegram_thread_id=? AND t.status='ACTIVE'
      AND p.telegram_user_id=? AND p.status='ACTIVE' LIMIT 1`,
  [workspaceId, String(message.chat.id), String(message.message_thread_id), String(message.from.id)]);
  if (!rows[0]) throw new AppError('El tema no está registrado o no eres un participante activo conocido', 403, 'TELEGRAM_TOPIC_ACCESS_DENIED');
  let capabilities = GROUP_PROFILES.CLIENT_TRACKING;
  try { capabilities = JSON.parse(rows[0].capabilities_json || JSON.stringify(capabilities)); } catch (_) { /* histórico */ }
  if (!capabilities.includes('CLIENT_QUERIES')) throw new AppError('Este grupo no tiene habilitadas las consultas de clientes', 403, 'TELEGRAM_GROUP_CAPABILITY_REQUIRED');
  return { clientId: rows[0].client_external_id };
}
async function clientForTopicCommand(workspaceId, message) {
  const context = await topicContextForCommand(workspaceId, message);
  return integrations.getMikrowispClient(workspaceId, context.clientId);
}

module.exports = { rememberManagedThread, GROUP_PROFILES, clean, publicGroup, publicTopic, publicParticipant, createLinkCode, confirmGroupLink, listGroups, previewTopic, listTopics, createTopic, registerExistingTopic, reconcileTopicEvent, changeTopicState, deleteTopic, recreateTopic, reconcileGroup, reconcileBotMembership, listParticipants, createParticipantInvite, removeParticipant, reconcileParticipantUpdate, topicContextForCommand, clientForTopicCommand, ownerForTelegramUser, groupCapabilities, requireCapability };
