// ============================================================
//  db/assignScanIp.js — Opción C: asigna/lista scan-IPs por workspace.
//
//  Uso:
//    node db/assignScanIp.js                 → lista las asignaciones
//    node db/assignScanIp.js <workspaceId>   → asigna la siguiente IP libre
//                                               del pool (.200-.230) — idempotente
//
//  Requisito previo (1 vez en el VPS): el pool debe existir en wg0 y el peer
//  del VPS en el MikroTik debe aceptarlo (allowed-address). Ver DESPLIEGUE_VPS.md §11.
// ============================================================
try { require('dotenv').config(); } catch (_) { /* opcional */ }

const scanIpRepo = require('./repos/scanIpRepo');

async function main() {
  const workspaceId = process.argv[2];

  if (!workspaceId) {
    const rows = await scanIpRepo.list();
    if (!rows.length) {
      console.log('[scan:assign] Sin asignaciones. Pool:', `${scanIpRepo.POOL_BASE}${scanIpRepo.POOL_START}-${scanIpRepo.POOL_END}`);
    } else {
      console.log('[scan:assign] Asignaciones actuales:');
      for (const r of rows) console.log(`  ${r.scan_ip}  ←  ${r.workspace_name || r.workspace_id}`);
    }
    process.exit(0);
  }

  const ip = await scanIpRepo.allocate(workspaceId);
  console.log(`[scan:assign] workspace ${workspaceId} → scan-IP ${ip}`);
  process.exit(0);
}

main().catch((err) => { console.error('[scan:assign] Error:', err.message); process.exit(1); });
