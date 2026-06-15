// ============================================================
//  routes/nodes/tags.routes.js — etiquetado de nodos
//
//   GET  /node/tags         → mapa { ppp_user: [tag, …] }
//   POST /node/tag/save     → reemplaza todas las tags de un nodo
// ============================================================

const express = require('express');
const router = express.Router();

const { getDb, getNodeId } = require('../../db.service');
const { nodeBelongsToRequester, requireOperator } = require('./_shared');

router.get('/node/tags', async (req, res) => {
  try {
    const db = await getDb();
    // Aislamiento multi-tenant: un moderador solo ve etiquetas de SU workspace.
    // El admin de plataforma (y tokens legacy sin RBAC) ven todo.
    const acc = req.account;
    const scoped = acc && !acc.platform_admin;
    const baseSql =
      `SELECT n.ppp_user, GROUP_CONCAT(t.name, ',') as tags_csv
       FROM nodes n
       LEFT JOIN node_tags nt ON nt.node_id = n.id
       LEFT JOIN tags t ON t.id = nt.tag_id
       ${scoped ? 'WHERE n.workspace_id = ?' : ''}
       GROUP BY n.id`;
    const rows = scoped
      ? await db.all(baseSql, [acc.workspace_id])
      : await db.all(baseSql);
    const result = {};
    rows.forEach(r => {
      result[r.ppp_user] = r.tags_csv ? r.tags_csv.split(',') : [];
    });
    res.json({ success: true, tags: result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/node/tag/save', requireOperator, async (req, res) => {
  const { pppUser, tags } = req.body;
  if (!pppUser) return res.status(400).json({ success: false, message: 'pppUser requerido' });
  if (!(await nodeBelongsToRequester(req, pppUser))) return res.status(404).json({ success: false, message: 'Nodo no encontrado en tu workspace' });
  try {
    const db = await getDb();
    const nodeId = await getNodeId(pppUser);
    if (!nodeId) return res.status(404).json({ success: false, message: `Nodo no encontrado: ${pppUser}` });

    const tagList = Array.isArray(tags) ? tags : [];

    // Ensure all tag names exist in the tags table
    for (const tagName of tagList) {
      await db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName]);
    }

    // Replace all tags for this node
    await db.run('DELETE FROM node_tags WHERE node_id = ?', [nodeId]);
    for (const tagName of tagList) {
      const tagRow = await db.get('SELECT id FROM tags WHERE name = ?', [tagName]);
      if (tagRow) {
        await db.run('INSERT INTO node_tags (node_id, tag_id) VALUES (?, ?)', [nodeId, tagRow.id]);
      }
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
