const express = require('express');
const { requireSession, requireRole } = require('../middleware/authJwt');
const { asyncHandler, sendOk } = require('../lib/apiResponse');
const integrations = require('../lib/workspaceIntegrationService');

const router = express.Router();
router.use(requireSession, requireRole('OWNER'));

router.get('/', asyncHandler(async (req, res) => sendOk(res, { integrations: await integrations.list(req.account.workspace_id) })));
router.put('/:provider', asyncHandler(async (req, res) => sendOk(res, { integration: await integrations.save({ workspaceId: req.account.workspace_id, userId: req.account.sub, provider: req.params.provider, config: req.body }) })));
router.post('/:provider/test', asyncHandler(async (req, res) => sendOk(res, { integration: await integrations.revalidate(req.account.workspace_id, req.params.provider) })));
router.delete('/:provider', asyncHandler(async (req, res) => { await integrations.remove(req.account.workspace_id, req.params.provider); return sendOk(res, { message: 'Integración desconectada' }); }));

module.exports = router;

