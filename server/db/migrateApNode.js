// ============================================================
//  db/migrateApNode.js — Fase 2-B: FK persistida aps.node_id
//
//  Idempotente:
//    • añade la columna aps.node_id (+ índice + FK) solo si falta
//    • backfill: resuelve el nodo dueño de cada AP sin node_id por
//        1. nombre_nodo exacto (aps.nombre_nodo == nodes.nombre_nodo)
//        2. subred (la IP del AP ∈ nodes.segmento_lan)
//
//  Uso:   cd server && npm run migrate:apnode
//  Sale 0 aunque todo estuviera ya aplicado — útil en CI/Docker.
//
//  NOTA: el backfill por nombre_nodo también lo hace el auto-heal de
//  initDb() en cada boot; este script añade el backfill por SUBRED
//  (que requiere lógica ipInCidr en JS, no expresable en SQL puro).
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const mysql = require('mysql2/promise');
const { ipInCidr } = require('../lib/apNode');

async function columnExists(conn, db, table, column) {
    const [rows] = await conn.execute(
        `SELECT 1 FROM information_schema.COLUMNS
          WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
        [db, table, column]
    );
    return rows.length > 0;
}

async function main() {
    const host = process.env.MYSQL_HOST || '127.0.0.1';
    const port = Number(process.env.MYSQL_PORT) || 3306;
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || '';
    const database = process.env.MYSQL_DATABASE || 'vpn_manager';

    console.log(`[migrate:apnode] Conectando a MySQL ${user}@${host}:${port}/${database} ...`);
    const conn = await mysql.createConnection({ host, port, user, password, database });

    try {
        // 1. Columna + índice + FK (idempotente)
        if (await columnExists(conn, database, 'aps', 'node_id')) {
            console.log('  ✓ columna aps.node_id ya existe');
        } else {
            await conn.query('ALTER TABLE aps ADD COLUMN node_id INT DEFAULT NULL');
            console.log('  + columna aps.node_id creada');
            await conn.query('ALTER TABLE aps ADD KEY idx_aps_node (node_id)').catch(e => console.log('  · índice:', e.message));
            await conn.query('ALTER TABLE aps ADD CONSTRAINT fk_ap_node FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE SET NULL')
                .catch(e => console.log('  · FK:', e.message));
        }

        // 2. Backfill por nombre_nodo (set-based, rápido)
        const [byName] = await conn.query(
            `UPDATE aps a JOIN nodes n ON a.nombre_nodo = n.nombre_nodo
                SET a.node_id = n.id
              WHERE a.node_id IS NULL AND a.nombre_nodo <> ''`
        );
        console.log(`  = backfill por nombre_nodo: ${byName.affectedRows} AP(s)`);

        // 3. Backfill por subred (ipInCidr en JS) para los que quedaron sin resolver
        const [nodes] = await conn.query('SELECT id, segmento_lan FROM nodes WHERE segmento_lan <> ""');
        const [pending] = await conn.query('SELECT id, ip FROM aps WHERE node_id IS NULL AND ip <> ""');
        let bySubnet = 0, unresolved = 0;
        for (const ap of pending) {
            const owner = nodes.find(n => ipInCidr(ap.ip, n.segmento_lan));
            if (owner) {
                await conn.query('UPDATE aps SET node_id = ? WHERE id = ?', [owner.id, ap.id]);
                bySubnet++;
            } else {
                unresolved++;
            }
        }
        console.log(`  = backfill por subred:     ${bySubnet} AP(s)`);
        console.log(`  · sin resolver (node_id NULL): ${unresolved} AP(s) — se resuelven en caliente al pollear`);

        console.log('\n[migrate:apnode] OK');
        process.exit(0);
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    console.error('[migrate:apnode] Error fatal:', err.message);
    process.exit(2);
});
