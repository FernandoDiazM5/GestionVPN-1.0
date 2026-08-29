const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { requireSession, requirePlatformAdmin } = require('../middleware/authJwt');
const { validate } = require('../middleware/validate');
const { asyncHandler, sendOk } = require('../lib/apiResponse');
const service = require('../lib/integrationGuideService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: service.MAX_BYTES } });
router.use(requireSession, requirePlatformAdmin);
router.get('/MIKROWISP', asyncHandler(async (_req, res) => sendOk(res, { guide: service.publicRow(await service.get(false)) })));
router.put('/MIKROWISP', upload.single('file'), asyncHandler(async (req, res) => sendOk(res, { guide: await service.save({ userId: req.account.sub, title: req.body?.title, version: req.body?.version, file: req.file }) })));
router.patch('/MIKROWISP', validate({ body: z.object({ active: z.boolean() }).strict() }), asyncHandler(async (req, res) => sendOk(res, { guide: await service.setActive(req.body.active) })));
module.exports = router;
