function unsafeConcatenation(db, req) {
  // ruleid: gestionvpn-sql-dynamic-query
  return db.query('SELECT * FROM users ORDER BY ' + req.query.order);
}

function unsafeTemplate(query, req) {
  // ruleid: gestionvpn-sql-dynamic-query
  return query(`SELECT * FROM users WHERE email = '${req.body.email}'`);
}

function safePlaceholder(db, req) {
  // ok: gestionvpn-sql-dynamic-query
  return db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
}

function safeConstantTemplate(query) {
  // ok: gestionvpn-sql-dynamic-query
  return query(`SELECT id, email FROM users ORDER BY created_at DESC`);
}

function safeParameterizedInList(db, ids) {
  const placeholders = ids.map(() => '?').join(',');
  // ok: gestionvpn-sql-dynamic-query
  return db.query(`SELECT * FROM users WHERE id IN (${placeholders})`, ids);
}

function unsafeIndirectOrder(db, req) {
  const order = req.query.order;
  // ruleid: gestionvpn-sql-dynamic-query
  return db.query(`SELECT * FROM users ORDER BY ${order}`);
}

function safeRequestIdsInList(db, req) {
  const ids = req.body.ids;
  const placeholders = ids.map(() => '?').join(',');
  // ok: gestionvpn-sql-dynamic-query
  return db.query(`SELECT * FROM users WHERE id IN (${placeholders})`, ids);
}
