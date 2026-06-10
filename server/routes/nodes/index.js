// ============================================================
//  routes/nodes/index.js — router compuesto de "nodos"
//
//  Reemplaza al antiguo routes/node.routes.js (1264 LOC) tras
//  FASE 6 del REFACTOR_PLAN. Cada sub-router agrupa por
//  responsabilidad, todos se montan en /api (en server/index.js)
//  y comparten helpers desde ./_shared.
//
//  El orden de uso es inocuo (rutas únicas), pero respetamos un
//  agrupamiento legible: listado → alta/baja → edición → metadatos.
// ============================================================

const express = require('express');
const router = express.Router();

router.use(require('./listing.routes'));
router.use(require('./provision.routes'));
router.use(require('./editing.routes'));
router.use(require('./tags.routes'));
router.use(require('./credentials.routes'));
router.use(require('./history.routes'));
router.use(require('./scan.routes'));

module.exports = router;
