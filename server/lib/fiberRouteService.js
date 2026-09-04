const crypto = require('crypto');
const { query, withTransaction } = require('../db/mysql');
const integrations = require('./workspaceIntegrationService');
const telegram = require('./telegram');
const forums = require('./telegramForumService');
const { AppError } = require('./apiResponse');

const ROUTE_STATES = new Set(['DRAFT', 'SURVEY', 'CONSTRUCTION', 'PENDING_MEASUREMENT', 'OPERATIONAL', 'INCIDENT', 'MODIFIED', 'RETIRED']);
const ELEMENT_TYPES = new Set(['ODF', 'CLOSURE', 'SPLITTER', 'NAP', 'DESTINATION', 'SEGMENT']);
const clean = forums.clean;

function publicRoute(row) {
  return {
    id: row.id, groupId: row.group_id, topicId: row.topic_id, code: row.code, name: row.name, zone: row.zone,
    status: row.status, responsibleUserId: row.responsible_user_id, cableType: row.cable_type,
    cableCapacity: row.cable_capacity === null ? null : Number(row.cable_capacity), originCoordinates: row.origin_coordinates,
    destinationCoordinates: row.destination_coordinates, closedAt: row.closed_at ? Number(row.closed_at) : null,
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
  };
}
function publicElement(row) {
  return { id: row.id, routeId: row.route_id, sequence: Number(row.sequence_no), type: row.element_type, name: row.name, location: row.location, coordinates: row.coordinates, tray: row.tray, port: row.port, inputCable: row.input_cable, inputFiber: row.input_fiber, outputCable: row.output_cable, outputFiber: row.output_fiber, fusionType: row.fusion_type, splitterRatio: row.splitter_ratio, reserveLength: row.reserve_length, notes: row.notes, createdAt: Number(row.created_at) };
}
function publicMeasurement(row) { return { id: row.id, routeId: row.route_id, elementId: row.element_id, powerDbm: Number(row.power_dbm), wavelengthNm: row.wavelength_nm === null ? null : Number(row.wavelength_nm), notes: row.notes, measuredAt: Number(row.measured_at) }; }
function publicEvidence(row) { return { id: row.id, routeId: row.route_id, elementId: row.element_id, type: row.evidence_type, description: row.description, telegramFileId: row.telegram_file_id || null, createdAt: Number(row.created_at) }; }
async function event(tx, workspaceId, routeId, userId, type, detail = null) {
  await tx.query('INSERT INTO fiber_route_events (id,workspace_id,route_id,actor_user_id,event_type,detail,created_at) VALUES (?,?,?,?,?,?,?)', [crypto.randomUUID(), workspaceId, routeId, userId, type, detail ? clean(detail, 512) : null, Date.now()]);
}
async function activeGroup(workspaceId, groupId) {
  await forums.requireCapability(groupId, 'FIBER_ROUTES');
  const rows = await query("SELECT * FROM telegram_forum_groups WHERE id=? AND workspace_id=? AND status='ACTIVE' LIMIT 1", [groupId, workspaceId]);
  if (!rows[0]) throw new AppError('Grupo de rutas no encontrado o inactivo', 404, 'FIBER_GROUP_NOT_FOUND');
  return rows[0];
}
async function createRoute(workspaceId, userId, groupId, input) {
  const group = await activeGroup(workspaceId, groupId);
  const code = clean(input.code, 32).toUpperCase(); const name = clean(input.name, 128); const zone = clean(input.zone, 128);
  if (!code || !name || !zone) throw new AppError('Código, nombre y zona son obligatorios', 422, 'FIBER_ROUTE_INVALID');
  const topicName = `${code} · ${name} → ${zone}`.slice(0, 128);
  const config = await integrations.getSecret(workspaceId, 'TELEGRAM');
  if (!config?.botToken) throw new AppError('Configura primero el bot Telegram', 404, 'INTEGRATION_NOT_CONFIGURED');
  const created = await telegram.createForumTopic({ token: config.botToken, chatId: group.telegram_chat_id, name: topicName });
  if (!created.ok) throw new AppError(created.ambiguous ? 'Telegram no confirmó la creación; verifica antes de repetir' : 'Telegram rechazó la creación del tema', 502, created.ambiguous ? 'CREATE_UNKNOWN' : 'TELEGRAM_TOPIC_CREATE_FAILED');
  const routeId = crypto.randomUUID(); const topicId = crypto.randomUUID(); const now = Date.now();
  try {
    await withTransaction(async tx => {
      await tx.query(`INSERT INTO telegram_forum_topics (id,workspace_id,group_id,client_external_id,client_name,topic_name,telegram_thread_id,status,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?,?)`, [topicId, workspaceId, groupId, `FIBER:${routeId}`, name, topicName, String(created.result.message_thread_id), userId, now, now]);
      await tx.query(`INSERT INTO fiber_routes (id,workspace_id,group_id,topic_id,code,name,zone,status,responsible_user_id,cable_type,cable_capacity,origin_coordinates,destination_coordinates,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?,?)`, [routeId, workspaceId, groupId, topicId, code, name, zone, input.responsibleUserId || userId, clean(input.cableType, 64) || null, input.cableCapacity || null, clean(input.originCoordinates, 128) || null, clean(input.destinationCoordinates, 128) || null, userId, now, now]);
      await event(tx, workspaceId, routeId, userId, 'ROUTE_CREATED', topicName);
    });
  } catch (error) {
    await telegram.deleteForumTopic({ token: config.botToken, chatId: group.telegram_chat_id, threadId: created.result.message_thread_id }).catch(() => null);
    if (error.code === 'ER_DUP_ENTRY') throw new AppError('Ya existe una ruta con ese código', 409, 'FIBER_ROUTE_DUPLICATE');
    throw error;
  }
  return publicRoute({ id: routeId, group_id: groupId, topic_id: topicId, code, name, zone, status: 'DRAFT', responsible_user_id: input.responsibleUserId || userId, cable_type: input.cableType || null, cable_capacity: input.cableCapacity || null, origin_coordinates: input.originCoordinates || null, destination_coordinates: input.destinationCoordinates || null, closed_at: null, created_at: now, updated_at: now });
}
async function registerExistingRoute({ workspaceId, botToken, message, name: requestedName, zone: requestedZone }) {
  const threadId = Number(message?.message_thread_id);
  if (message?.chat?.type !== 'supergroup' || !Number.isSafeInteger(threadId) || threadId <= 1 || !message?.from?.id) {
    throw new AppError('Ejecuta /registrar_ruta dentro del tema existente del grupo de fibra, no en General.', 422, 'FIBER_TOPIC_REQUIRED');
  }
  const userId = await forums.ownerForTelegramUser(workspaceId, message.from.id, botToken);
  if (!userId) throw new AppError('Vincula tu cuenta de Telegram al propietario de Joinpoint para registrar la ruta.', 403, 'TELEGRAM_GROUP_OWNER_REQUIRED');
  const groups = await query("SELECT * FROM telegram_forum_groups WHERE workspace_id=? AND telegram_chat_id=? AND status='ACTIVE' LIMIT 1", [workspaceId, String(message.chat.id)]);
  if (!groups[0]) throw new AppError('Este grupo no está vinculado o activo en Joinpoint.', 404, 'FIBER_GROUP_NOT_FOUND');
  const groupId = groups[0].id;
  await forums.requireCapability(groupId, 'FIBER_ROUTES');
  return withTransaction(async tx => {
    // Serializa registros del mismo grupo para que repetir el comando no duplique rutas.
    const locked = await tx.query("SELECT id FROM telegram_forum_groups WHERE id=? AND workspace_id=? AND status='ACTIVE' FOR UPDATE", [groupId, workspaceId]);
    if (!locked[0]) throw new AppError('Grupo de fibra no disponible.', 409, 'FIBER_GROUP_NOT_FOUND');
    const existingRoutes = await tx.query('SELECT r.* FROM fiber_routes r JOIN telegram_forum_topics t ON t.id=r.topic_id WHERE r.workspace_id=? AND r.group_id=? AND t.telegram_thread_id=? LIMIT 1', [workspaceId, groupId, String(threadId)]);
    if (existingRoutes[0]) return publicRoute(existingRoutes[0]);
    const topics = await tx.query('SELECT * FROM telegram_forum_topics WHERE workspace_id=? AND group_id=? AND telegram_thread_id=? FOR UPDATE', [workspaceId, groupId, String(threadId)]);
    if (topics.length > 1 || (topics[0] && topics[0].status !== 'UNREGISTERED')) throw new AppError('El tema ya está asociado a otro registro. Revisa su vínculo en Joinpoint.', 409, 'FIBER_TOPIC_ALREADY_REGISTERED');
    const routeId = crypto.randomUUID(); const topicId = topics[0]?.id || crypto.randomUUID(); const now = Date.now();
    const code = 'RF-' + routeId.replace(/-/g, '').slice(0, 12).toUpperCase();
    const name = clean(requestedName || topics[0]?.topic_name || message.reply_to_message?.forum_topic_created?.name || ('Ruta de fibra ' + threadId), 128);
    const zone = clean(requestedZone, 128) || 'Por definir';
    if (topics[0]) {
      await tx.query("UPDATE telegram_forum_topics SET client_external_id=?,client_name=?,status='ACTIVE',created_by=?,updated_at=? WHERE id=?", ['FIBER:' + routeId, name, userId, now, topicId]);
    } else {
      await tx.query("INSERT INTO telegram_forum_topics (id,workspace_id,group_id,client_external_id,client_name,topic_name,telegram_thread_id,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?,?)", [topicId, workspaceId, groupId, 'FIBER:' + routeId, name, name, String(threadId), userId, now, now]);
    }
    await tx.query("INSERT INTO fiber_routes (id,workspace_id,group_id,topic_id,code,name,zone,status,responsible_user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'DRAFT',?,?,?,?)", [routeId, workspaceId, groupId, topicId, code, name, zone, userId, userId, now, now]);
    await event(tx, workspaceId, routeId, userId, 'EXISTING_TOPIC_REGISTERED', 'Tema existente ' + threadId);
    return publicRoute({ id: routeId, workspace_id: workspaceId, group_id: groupId, topic_id: topicId, code, name, zone, status: 'DRAFT', responsible_user_id: userId, cable_capacity: null, created_at: now, updated_at: now });
  });
}
async function listRoutes(workspaceId, groupId) {
  await forums.requireCapability(groupId, 'FIBER_ROUTES');
  return (await query('SELECT * FROM fiber_routes WHERE workspace_id=? AND group_id=? ORDER BY updated_at DESC', [workspaceId, groupId])).map(publicRoute);
}
async function routeRow(workspaceId, routeId) {
  const rows = await query('SELECT * FROM fiber_routes WHERE id=? AND workspace_id=? LIMIT 1', [routeId, workspaceId]);
  if (!rows[0]) throw new AppError('Ruta de fibra no encontrada', 404, 'FIBER_ROUTE_NOT_FOUND');
  return rows[0];
}
async function detail(workspaceId, routeId) {
  const route = await routeRow(workspaceId, routeId);
  const [elements, measurements, evidence, events] = await Promise.all([
    query('SELECT * FROM fiber_route_elements WHERE workspace_id=? AND route_id=? ORDER BY sequence_no', [workspaceId, routeId]),
    query('SELECT * FROM fiber_route_measurements WHERE workspace_id=? AND route_id=? ORDER BY measured_at DESC', [workspaceId, routeId]),
    query('SELECT * FROM fiber_route_evidence WHERE workspace_id=? AND route_id=? ORDER BY created_at DESC', [workspaceId, routeId]),
    query('SELECT event_type,detail,actor_user_id,created_at FROM fiber_route_events WHERE workspace_id=? AND route_id=? ORDER BY created_at DESC LIMIT 100', [workspaceId, routeId]),
  ]);
  return { route: publicRoute(route), elements: elements.map(publicElement), measurements: measurements.map(publicMeasurement), evidence: evidence.map(publicEvidence), events: events.map(row => ({ type: row.event_type, detail: row.detail, actorUserId: row.actor_user_id, createdAt: Number(row.created_at) })) };
}
async function addElement(workspaceId, userId, routeId, input) {
  await routeRow(workspaceId, routeId);
  const type = String(input.type || '').toUpperCase();
  if (!ELEMENT_TYPES.has(type) || !clean(input.name, 128)) throw new AppError('Tipo y nombre de elemento inválidos', 422, 'FIBER_ELEMENT_INVALID');
  const max = await query('SELECT COALESCE(MAX(sequence_no),0) AS sequence_no FROM fiber_route_elements WHERE route_id=?', [routeId]);
  const id = crypto.randomUUID(); const now = Date.now(); const sequence = Number(max[0].sequence_no) + 1;
  await withTransaction(async tx => {
    await tx.query(`INSERT INTO fiber_route_elements
      (id,workspace_id,route_id,sequence_no,element_type,name,location,coordinates,tray,port,input_cable,input_fiber,output_cable,output_fiber,fusion_type,splitter_ratio,reserve_length,notes,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, workspaceId, routeId, sequence, type, clean(input.name, 128), clean(input.location, 255) || null, clean(input.coordinates, 128) || null, clean(input.tray, 64) || null, clean(input.port, 64) || null, clean(input.inputCable, 128) || null, clean(input.inputFiber, 64) || null, clean(input.outputCable, 128) || null, clean(input.outputFiber, 64) || null, clean(input.fusionType, 64) || null, clean(input.splitterRatio, 32) || null, clean(input.reserveLength, 32) || null, clean(input.notes, 512) || null, userId, now, now]);
    await tx.query("UPDATE fiber_routes SET status=IF(status='DRAFT','SURVEY',status),updated_at=? WHERE id=?", [now, routeId]);
    await event(tx, workspaceId, routeId, userId, 'ELEMENT_ADDED', `${sequence}. ${type}: ${input.name}`);
  });
  return publicElement({ id, route_id: routeId, sequence_no: sequence, element_type: type, name: clean(input.name, 128), location: input.location || null, coordinates: input.coordinates || null, tray: input.tray || null, port: input.port || null, input_cable: input.inputCable || null, input_fiber: input.inputFiber || null, output_cable: input.outputCable || null, output_fiber: input.outputFiber || null, fusion_type: input.fusionType || null, splitter_ratio: input.splitterRatio || null, reserve_length: input.reserveLength || null, notes: input.notes || null, created_at: now });
}
async function addMeasurement(workspaceId, userId, routeId, input) {
  await routeRow(workspaceId, routeId); const power = Number(input.powerDbm);
  if (!Number.isFinite(power) || power < -100 || power > 20) throw new AppError('Potencia óptica inválida', 422, 'FIBER_MEASUREMENT_INVALID');
  const id = crypto.randomUUID(); const now = Date.now();
  await withTransaction(async tx => {
    await tx.query('INSERT INTO fiber_route_measurements (id,workspace_id,route_id,element_id,power_dbm,wavelength_nm,notes,measured_by,measured_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, workspaceId, routeId, input.elementId || null, power, input.wavelengthNm || null, clean(input.notes, 512) || null, userId, now, now]);
    await tx.query("UPDATE fiber_routes SET status=IF(status IN ('DRAFT','SURVEY','CONSTRUCTION','PENDING_MEASUREMENT'),'OPERATIONAL',status),updated_at=? WHERE id=?", [now, routeId]);
    await event(tx, workspaceId, routeId, userId, 'MEASUREMENT_ADDED', `${power} dBm`);
  });
  return publicMeasurement({ id, route_id: routeId, element_id: input.elementId || null, power_dbm: power, wavelength_nm: input.wavelengthNm || null, notes: input.notes || null, measured_at: now });
}
async function addEvidence(workspaceId, userId, routeId, input) {
  await routeRow(workspaceId, routeId); const description = clean(input.description, 512);
  if (!description) throw new AppError('La descripción de la evidencia es obligatoria', 422, 'FIBER_EVIDENCE_INVALID');
  const id = crypto.randomUUID(); const now = Date.now();
  await withTransaction(async tx => {
    await tx.query('INSERT INTO fiber_route_evidence (id,workspace_id,route_id,element_id,telegram_file_id,evidence_type,description,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [id, workspaceId, routeId, input.elementId || null, clean(input.telegramFileId, 255) || null, input.type || 'NOTE', description, userId, now]);
    await event(tx, workspaceId, routeId, userId, 'EVIDENCE_ADDED', description);
  });
  return publicEvidence({ id, route_id: routeId, element_id: input.elementId || null, telegram_file_id: input.telegramFileId || null, evidence_type: input.type || 'NOTE', description, created_at: now });
}
async function changeStatus(workspaceId, userId, routeId, status, reason) {
  const route = await routeRow(workspaceId, routeId); const next = String(status || '').toUpperCase();
  if (!ROUTE_STATES.has(next)) throw new AppError('Estado de ruta inválido', 422, 'FIBER_ROUTE_STATUS_INVALID');
  const now = Date.now();
  await withTransaction(async tx => {
    await tx.query('UPDATE fiber_routes SET status=?,closed_at=?,updated_at=? WHERE id=?', [next, next === 'RETIRED' ? now : null, now, routeId]);
    await event(tx, workspaceId, routeId, userId, 'STATUS_CHANGED', `${route.status} → ${next}${reason ? `: ${clean(reason, 300)}` : ''}`);
  });
  return publicRoute({ ...route, status: next, closed_at: next === 'RETIRED' ? now : null, updated_at: now });
}
async function context(workspaceId, message) {
  if (!message?.chat?.id || !message.message_thread_id || !message.from?.id) throw new AppError('Ejecuta el comando dentro del tema de una ruta', 422, 'FIBER_TOPIC_REQUIRED');
  const rows = await query(`SELECT r.*,p.user_id FROM fiber_routes r
    JOIN telegram_forum_topics t ON t.id=r.topic_id AND t.status='ACTIVE'
    JOIN telegram_forum_groups g ON g.id=r.group_id AND g.status='ACTIVE'
    JOIN telegram_forum_participants p ON p.group_id=g.id AND p.status='ACTIVE'
    WHERE r.workspace_id=? AND g.telegram_chat_id=? AND t.telegram_thread_id=? AND p.telegram_user_id=? LIMIT 1`, [workspaceId, String(message.chat.id), String(message.message_thread_id), String(message.from.id)]);
  if (!rows[0]) throw new AppError('La ruta no está registrada o no eres participante autorizado', 403, 'FIBER_ROUTE_ACCESS_DENIED');
  return { route: rows[0], userId: rows[0].user_id };
}
function summary(data) {
  const lines = [`<b>${data.route.code} · ${data.route.name}</b>`, `Zona: ${data.route.zone}`, `Estado: ${data.route.status}`, `Elementos: ${data.elements.length}`];
  for (const element of data.elements) lines.push(`${element.sequence}. ${element.type} · ${element.name}${element.inputFiber || element.outputFiber ? ` (${element.inputFiber || '-'} → ${element.outputFiber || '-'})` : ''}`);
  if (data.measurements[0]) lines.push(`Última potencia: ${data.measurements[0].powerDbm} dBm`);
  return lines.join('\n');
}

module.exports = { ROUTE_STATES, ELEMENT_TYPES, registerExistingRoute, createRoute, listRoutes, detail, addElement, addMeasurement, addEvidence, changeStatus, context, summary };
