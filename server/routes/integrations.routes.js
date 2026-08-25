const express = require('express');
const { requireSession, requireRole } = require('../middleware/authJwt');
const { asyncHandler, sendOk } = require('../lib/apiResponse');
const integrations = require('../lib/workspaceIntegrationService');
const workspaceBots = require('../lib/workspaceTelegramBots');

const router = express.Router();
router.use(requireSession, requireRole('OWNER'));

router.get('/', asyncHandler(async (req, res) => sendOk(res, { integrations: await integrations.list(req.account.workspace_id) })));
async function refreshTelegram(provider) { if (String(provider).toUpperCase() === 'TELEGRAM') await workspaceBots.refresh(); }
router.put('/:provider', asyncHandler(async (req, res) => { const integration = await integrations.save({ workspaceId: req.account.workspace_id, userId: req.account.sub, provider: req.params.provider, config: req.body }); await refreshTelegram(req.params.provider); return sendOk(res, { integration }); }));
router.post('/:provider/test', asyncHandler(async (req, res) => { const integration = await integrations.revalidate(req.account.workspace_id, req.params.provider); await refreshTelegram(req.params.provider); return sendOk(res, { integration }); }));
router.delete('/:provider', asyncHandler(async (req, res) => { await integrations.remove(req.account.workspace_id, req.params.provider); await refreshTelegram(req.params.provider); return sendOk(res, { message: 'Integración desconectada' }); }));

module.exports = router;
