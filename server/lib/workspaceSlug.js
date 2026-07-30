const MAX_SLUG_LENGTH = 80;

function slugifyWorkspaceName(value) {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug || 'workspace';
}

async function allocateWorkspaceSlug(query, { name, workspaceId }) {
  const base = slugifyWorkspaceName(name);
  const candidates = [
    base,
    `${base.slice(0, MAX_SLUG_LENGTH - 7)}-${String(workspaceId).slice(0, 6).toLowerCase()}`,
  ];

  for (const candidate of candidates) {
    const rows = await query(
      'SELECT id FROM workspaces WHERE slug = ? AND id <> ? LIMIT 1',
      [candidate, workspaceId],
    );
    if (rows.length === 0) return candidate;
  }

  return `${base.slice(0, MAX_SLUG_LENGTH - 13)}-${String(workspaceId).slice(0, 12).toLowerCase()}`;
}

module.exports = { MAX_SLUG_LENGTH, slugifyWorkspaceName, allocateWorkspaceSlug };
