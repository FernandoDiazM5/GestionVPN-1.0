// ============================================================
//  routes/core/index.js — router compuesto "core" (conectividad
//  RouterOS + túnel multi-usuario por IP).
//
//  Reemplaza al antiguo routes/core.routes.js (935 LOC) tras
//  FASE 7 del REFACTOR_PLAN. Cada sub-router agrupa por
//  responsabilidad y todos se montan en /api (server/index.js).
//
//  ★ El registry SSE singleton vive en ./_shared para que
//    tunnel.routes.js (escribe) y los demás (leen) compartan el
//    MISMO Map<userId, Set<res>>. Crear Maps separados rompería
//    los eventos en tiempo real.
// ============================================================

const express = require('express');
const router = express.Router();

router.use(require('./connection.routes'));
router.use(require('./ppp.routes'));
router.use(require('./interface.routes'));
router.use(require('./tunnel.routes'));
router.use(require('./tunnel-repair.routes'));

module.exports = router;
