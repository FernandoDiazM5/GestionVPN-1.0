const express = require('express');
const { z } = require('zod');
const { requireSession, requireRole } = require('../middleware/authJwt');
const { validate } = require('../middleware/validate');
const { asyncHandler, sendOk } = require('../lib/apiResponse');
const integrations = require('../lib/workspaceIntegrationService');
const catalogs = require('../lib/externalCatalogService');
const forums = require('../lib/telegramForumService');
const workspaceBots = require('../lib/workspaceTelegramBots');

const router = express.Router();
const MikrowispClientParamsSchema = z.object({ clientId: z.string().regex(/^\d{1,15}$/) }).strict();
const CatalogParamsSchema = z.object({ type: z.literal('ROUTERS') }).strict();
const GroupParamsSchema = z.object({ groupId: z.string().uuid() }).strict();
const TopicParamsSchema = z.object({ groupId: z.string().uuid(), topicId: z.string().uuid() }).strict();
const ParticipantParamsSchema = z.object({ groupId: z.string().uuid(), userId: z.string().uuid() }).strict();
const TopicClientSchema = z.object({ clientId: z.union([z.string().regex(/^\d{1,15}$/), z.number().int().positive()]).transform(String) }).strict();
router.use(requireSession, requireRole('OWNER'));

router.get('/', asyncHandler(async (req, res) => sendOk(res, { integrations: await integrations.list(req.account.workspace_id) })));
router.get('/mikrowisp/clients/:clientId', validate({ params: MikrowispClientParamsSchema }), asyncHandler(async (req, res) => sendOk(res, { client: await integrations.getMikrowispClient(req.account.workspace_id, req.params.clientId) })));
router.get('/mikrowisp/catalogs', asyncHandler(async (req, res) => sendOk(res, { catalogs: await catalogs.listTypes(req.account.workspace_id) })));
router.get('/mikrowisp/catalogs/:type', validate({ params: CatalogParamsSchema }), asyncHandler(async (req, res) => sendOk(res, { catalog: await catalogs.list(req.account.workspace_id, req.params.type) })));
router.post('/mikrowisp/catalogs/:type/sync', validate({ params: CatalogParamsSchema, body: z.object({}).strict() }), asyncHandler(async (req, res) => sendOk(res, { catalog: await catalogs.sync(req.account.workspace_id, req.params.type) })));
router.get('/mikrowisp/telegram-forums', asyncHandler(async (req, res) => sendOk(res, { groups: await forums.listGroups(req.account.workspace_id) })));
router.get('/mikrowisp/guide', asyncHandler(async (_req, res) => sendOk(res, { guide: require('../lib/integrationGuideService').publicRow(await require('../lib/integrationGuideService').get(true)) })));
router.get('/mikrowisp/guide/download', asyncHandler(async (_req, res) => { const file = await require('../lib/integrationGuideService').download(); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${String(file.row.file_name).replace(/[^a-zA-Z0-9._-]/g, '_')}"`); return res.sendFile(file.path); }));
router.post('/mikrowisp/telegram-forums/link-code', validate({ body: z.object({}).strict() }), asyncHandler(async (req, res) => sendOk(res, { link: await forums.createLinkCode(req.account.workspace_id, req.account.sub) }, 201)));
router.get('/mikrowisp/telegram-forums/:groupId/topics', validate({ params: GroupParamsSchema }), asyncHandler(async (req, res) => sendOk(res, { topics: await forums.listTopics(req.account.workspace_id, req.params.groupId) })));
router.post('/mikrowisp/telegram-forums/:groupId/topics/preview', validate({ params: GroupParamsSchema, body: TopicClientSchema }), asyncHandler(async (req, res) => sendOk(res, { preview: await forums.previewTopic(req.account.workspace_id, req.params.groupId, req.body.clientId) })));
router.post('/mikrowisp/telegram-forums/:groupId/topics', validate({ params: GroupParamsSchema, body: TopicClientSchema }), asyncHandler(async (req, res) => sendOk(res, { topic: await forums.createTopic(req.account.workspace_id, req.account.sub, req.params.groupId, req.body.clientId) }, 201)));
router.post('/mikrowisp/telegram-forums/:groupId/topics/:topicId/close', validate({ params: TopicParamsSchema, body: z.object({}).strict() }), asyncHandler(async (req, res) => sendOk(res, { topic: await forums.changeTopicState(req.account.workspace_id, req.account.sub, req.params.groupId, req.params.topicId, 'close') })));
router.post('/mikrowisp/telegram-forums/:groupId/topics/:topicId/reopen', validate({ params: TopicParamsSchema, body: z.object({}).strict() }), asyncHandler(async (req, res) => sendOk(res, { topic: await forums.changeTopicState(req.account.workspace_id, req.account.sub, req.params.groupId, req.params.topicId, 'reopen') })));
router.post('/mikrowisp/telegram-forums/:groupId/topics/:topicId/recreate', validate({ params: TopicParamsSchema, body: z.object({ confirm: z.literal(true) }).strict() }), asyncHandler(async (req, res) => sendOk(res, { topic: await forums.recreateTopic(req.account.workspace_id, req.account.sub, req.params.groupId, req.params.topicId) })));
router.get('/mikrowisp/telegram-forums/:groupId/participants', validate({ params: GroupParamsSchema }), asyncHandler(async (req, res) => sendOk(res, { participants: await forums.listParticipants(req.account.workspace_id, req.params.groupId) })));
router.post('/mikrowisp/telegram-forums/:groupId/participants/:userId/invite', validate({ params: ParticipantParamsSchema, body: z.object({}).strict() }), asyncHandler(async (req, res) => sendOk(res, { participant: await forums.createParticipantInvite(req.account.workspace_id, req.account.sub, req.params.groupId, req.params.userId) }, 201)));
router.post('/mikrowisp/telegram-forums/:groupId/participants/:userId/remove', validate({ params: ParticipantParamsSchema, body: z.object({ confirm: z.literal(true) }).strict() }), asyncHandler(async (req, res) => sendOk(res, { participant: await forums.removeParticipant(req.account.workspace_id, req.account.sub, req.params.groupId, req.params.userId) })));
router.post('/mikrowisp/telegram-forums/:groupId/participants/:userId/reinstate', validate({ params: ParticipantParamsSchema, body: z.object({ confirm: z.literal(true) }).strict() }), asyncHandler(async (req, res) => sendOk(res, { participant: await forums.createParticipantInvite(req.account.workspace_id, req.account.sub, req.params.groupId, req.params.userId, { reinstate: true }) })));
async function refreshTelegram(provider) { if (String(provider).toUpperCase() === 'TELEGRAM') await workspaceBots.refresh(); }
router.put('/:provider', asyncHandler(async (req, res) => { const integration = await integrations.save({ workspaceId: req.account.workspace_id, userId: req.account.sub, provider: req.params.provider, config: req.body }); await refreshTelegram(req.params.provider); return sendOk(res, { integration }); }));
router.post('/:provider/test', asyncHandler(async (req, res) => { const integration = await integrations.revalidate(req.account.workspace_id, req.params.provider); await refreshTelegram(req.params.provider); return sendOk(res, { integration }); }));
router.delete('/:provider', asyncHandler(async (req, res) => { await integrations.remove(req.account.workspace_id, req.params.provider); await refreshTelegram(req.params.provider); return sendOk(res, { message: 'Integración desconectada' }); }));

module.exports = router;
