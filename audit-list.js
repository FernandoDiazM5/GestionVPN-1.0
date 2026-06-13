const d = require('./audit-temp.json');
const files = [
  'ModeratorsModule.tsx',
  'DeviceFilters.tsx',
  'DeviceStatusPanel.tsx',
  'NodesListSection.tsx',
  'BatchCsvModal.tsx',
  'EditarNodo.tsx',
  'EliminarNodo.tsx',
  'HistoryModal.tsx',
  'NuevoAdmin.tsx',
  'NuevoNodo.tsx',
  'ScriptModal.tsx',
  'TagModal.tsx',
  'Sidebar.tsx',
  'AssignTunnelsModal.tsx',
  'MemberWireGuardModal.tsx',
  'AdminPeersManager.tsx',
  'WgConfigModal.tsx',
];
files.forEach(n => {
  const rows = d.findings.filter(f => f.ruleId === 'DS02-bg-without-dark' && f.file.replace(/\\/g, '/').endsWith(n));
  if (rows.length === 0) return;
  console.log('\n---', n, '(' + rows.length + ') ---');
  console.log('FILE:', rows[0].file);
  rows.forEach(f => console.log(f.line + ':', f.message, '|', f.snippet.trim().slice(0, 180)));
});
