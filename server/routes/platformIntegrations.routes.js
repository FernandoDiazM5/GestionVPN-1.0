const express = require('express');
const { requireSession, requirePlatformAdmin } = require('../middleware/authJwt');
const { asyncHandler, sendOk } = require('../lib/apiResponse');
const service = require('../lib/platformIntegrationService');
const router = express.Router();
router.use(requireSession, requirePlatformAdmin);
router.get('/', asyncHandler(async (_req, res) => sendOk(res, { integrations: await service.list() })));
async function reloadTelegram(provider) {
  if (String(provider).toUpperCase() !== 'TELEGRAM') return;
  const bot = require('../lib/telegramBot');
  bot.stop();
  await bot.start();
}
router.put('/:provider', asyncHandler(async (req, res) => { const integration = await service.save({ userId: req.account.sub, provider: req.params.provider, config: req.body }); await reloadTelegram(req.params.provider); return sendOk(res, { integration }); }));
router.post('/:provider/test', asyncHandler(async (req, res) => { const integration = await service.revalidate(req.params.provider); await reloadTelegram(req.params.provider); return sendOk(res, { integration }); }));
router.delete('/:provider', asyncHandler(async (req, res) => { await service.remove(req.params.provider); await reloadTelegram(req.params.provider); return sendOk(res, { message: 'Integración desconectada' }); }));
module.exports = router;
