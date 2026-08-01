#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
const OUTPUT_FILE = path.join(REPO_ROOT, 'docs', 'security', 'ROUTE_SECURITY_INVENTORY.md');

const GLOBALLY_AUTHENTICATED_FILES = [
  /^ap\.routes\.js$/,
  /^routes\/(?:ai|dashboard|device|diagnostics|settings|wireguard)\.routes\.js$/,
  /^routes\/(?:admin|adminSecurity|coreServer)\.routes\.js$/,
  /^routes\/core\//,
  /^routes\/nodes\//,
];

const GLOBAL_ROLES = [
  { pattern: /^routes\/(?:admin|coreServer)\.routes\.js$/, role: 'platform-admin' },
];

const IDENTITY_ENDPOINTS = /\/(?:login|setup|register|verify|resend|password-reset)(?:\/|$)/;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'test', 'tools'].includes(entry.name)) return [];
      return walk(fullPath);
    }
    return [fullPath];
  });
}

function isRouteFile(filePath) {
  const basename = path.basename(filePath);
  return basename.endsWith('.routes.js') || basename === 'auth.routes.js' || basename === 'ap.routes.js';
}

function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

function hasGlobalAuthentication(relativeFile) {
  return GLOBALLY_AUTHENTICATED_FILES.some((pattern) => pattern.test(relativeFile));
}

function globalRole(relativeFile) {
  return GLOBAL_ROLES.find(({ pattern }) => pattern.test(relativeFile))?.role || '';
}

function extractRole(segment) {
  if (/\brequirePlatformAdmin\b/.test(segment)) return 'platform-admin';
  if (/\brequireSecurityOperator\b/.test(segment)) return 'platform-admin or OWNER';
  const roleMatch = segment.match(/\brequireRole\s*\(\s*([^\n)]*)\)/);
  if (!roleMatch) return '';
  return roleMatch[1]
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectSinks(segment) {
  const sinks = [];
  if (/\b(?:db|pool|conn(?:ection)?)\.(?:execute|query|run|get|all)\s*\(/.test(segment)) sinks.push('sql');
  if (/\b(?:exec|execFile|spawn|fork)\s*\(/.test(segment)) sinks.push('process');
  if (/\b(?:writeFile|appendFile|unlink|rename|rm)\s*\(/.test(segment)) sinks.push('filesystem');
  if (/\b(?:ssh|RouterOS|mikrotik|wireguard|wg0)\b/i.test(segment)) sinks.push('network-admin');
  if (/\b(?:sendMail|transporter\.sendMail)\s*\(/.test(segment)) sinks.push('email');
  return [...new Set(sinks)];
}

function collectInventory() {
  const routeFiles = walk(SERVER_ROOT)
    .filter(isRouteFile)
    .sort((left, right) => left.localeCompare(right));
  const routes = [];

  for (const filePath of routeFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativeFile = normalizePath(path.relative(SERVER_ROOT, filePath));
    const fileAuthentication = /\brouter\.use\s*\([^;\n]*\b(?:requireSession|verifyToken|requirePlatformAdmin)\b/.test(source);
    const matches = [];
    const routePattern = /\brouter\.(get|post|put|patch|delete)\s*\(\s*(["'`])([^"'`\r\n]+)\2/g;
    let match;

    while ((match = routePattern.exec(source)) !== null) {
      matches.push({
        index: match.index,
        method: match[1].toUpperCase(),
        routePath: match[3],
      });
    }

    matches.forEach((routeMatch, index) => {
      const end = matches[index + 1]?.index ?? source.length;
      const segment = source.slice(routeMatch.index, end);
      const usesBody = /\breq\.body\b/.test(segment);
      const usesParams = /\breq\.params\b/.test(segment);
      const usesQuery = /\breq\.query\b/.test(segment);
      const validatesBody = /\b(?:safeParse|parse)\s*\(\s*req\.body\b/.test(segment)
        || /\bvalidate\s*\(\s*\{[^}]*\bbody\s*:/s.test(segment);
      const validatesParams = /\b(?:safeParse|parse)\s*\(\s*req\.params\b/.test(segment)
        || /\bvalidate\s*\(\s*\{[^}]*\bparams\s*:/s.test(segment);
      const validatesQuery = /\b(?:safeParse|parse)\s*\(\s*req\.query\b/.test(segment)
        || /\bvalidate\s*\(\s*\{[^}]*\bquery\s*:/s.test(segment);
      const routeAuthentication = /\b(?:requireSession|verifyToken|requirePlatformAdmin)\b|\brequireRole\s*\(/.test(segment);
      const authenticated = hasGlobalAuthentication(relativeFile) || fileAuthentication || routeAuthentication;
      const rateLimited = /\brl\.(?:guard|guardOtpSend|guardPolicy)\s*\(|\brateLimit(?:er)?\b|\bloginLimiter\b/.test(segment);
      const identityEndpoint = IDENTITY_ENDPOINTS.test(routeMatch.routePath);
      const sinks = detectSinks(segment);
      const risks = [];

      if (usesBody && !validatesBody) risks.push('BODY_SCHEMA_MISSING');
      if (usesParams && !validatesParams) risks.push('PARAM_SCHEMA_MISSING');
      if (usesQuery && !validatesQuery) risks.push('QUERY_SCHEMA_MISSING');
      if (!authenticated && identityEndpoint && !rateLimited) risks.push('PUBLIC_RATE_LIMIT_MISSING');
      if (BODY_METHODS.has(routeMatch.method) && usesBody && !authenticated && !identityEndpoint) {
        risks.push('PUBLIC_MUTATION_REVIEW');
      }

      routes.push({
        file: relativeFile,
        line: lineNumber(source, routeMatch.index),
        method: routeMatch.method,
        path: routeMatch.routePath,
        authenticated,
        role: globalRole(relativeFile) || extractRole(segment),
        rateLimited,
        usesBody,
        usesParams,
        usesQuery,
        validatesBody,
        validatesParams,
        validatesQuery,
        sinks,
        risks,
      });
    });
  }

  return routes;
}

function yesNo(value) {
  return value ? 'sí' : 'no';
}

function schemaStatus(usesInput, validatesInput) {
  if (!usesInput) return 'n/a';
  return validatesInput ? 'sí' : '**no**';
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdown(routes) {
  const mutationCount = routes.filter((route) => BODY_METHODS.has(route.method)).length;
  const bodyRoutes = routes.filter((route) => route.usesBody);
  const validatedBodyRoutes = bodyRoutes.filter((route) => route.validatesBody);
  const unguardedIdentityRoutes = routes.filter((route) => route.risks.includes('PUBLIC_RATE_LIMIT_MISSING'));
  const riskCounts = new Map();

  for (const route of routes) {
    for (const risk of route.risks) riskCounts.set(risk, (riskCounts.get(risk) || 0) + 1);
  }

  const riskSummary = [...riskCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([risk, count]) => `- \`${risk}\`: ${count}`)
    .join('\n') || '- Sin alertas estáticas.';

  const rows = routes.map((route) => {
    const risks = route.risks.length ? route.risks.map((risk) => `\`${risk}\``).join(', ') : '—';
    return `| \`${escapeCell(route.file)}\` | ${route.line} | ${route.method} | \`${escapeCell(route.path)}\` | ${yesNo(route.authenticated)} | ${escapeCell(route.role || '—')} | ${yesNo(route.rateLimited)} | ${schemaStatus(route.usesBody, route.validatesBody)} | ${escapeCell(route.sinks.join(', ') || '—')} | ${risks} |`;
  });

  return `# Inventario de seguridad de rutas API

> Archivo generado por \`server/tools/security-route-inventory.js\`. No editar manualmente.

Este inventario es una línea base estática para priorizar el hardening. No sustituye pruebas de integración ni una revisión manual de autorización por recurso.

## Resumen

- Rutas detectadas: ${routes.length}
- Rutas de mutación (POST/PUT/PATCH): ${mutationCount}
- Rutas que consumen \`req.body\`: ${bodyRoutes.length}
- Rutas con esquema de \`req.body\` detectable: ${validatedBodyRoutes.length}/${bodyRoutes.length}
- Endpoints públicos de identidad sin rate limiting detectable: ${unguardedIdentityRoutes.length}

## Alertas detectadas

${riskSummary}

## Criterios

- **Autenticación:** middleware en la propia ruta o montaje global protegido declarado en el servidor.
- **Rate limiting:** guardas \`rl.guard\`, \`rl.guardOtpSend\`, \`rl.guardPolicy\` o un limiter explícito.
- **Schema body:** middleware \`validate({ body })\` o parseo Zod directo detectable.
- **Sinks:** uso estático detectable de SQL, procesos, filesystem, correo o administración de red.
- Las alertas \`*_SCHEMA_MISSING\` también pueden señalar validaciones indirectas; deben revisarse antes de corregir.
- \`PUBLIC_MUTATION_REVIEW\` exige confirmar que la exposición anónima sea intencional y segura.

## Rutas

| Archivo | Línea | Método | Ruta | Auth | Rol | Rate limit | Schema body | Sinks | Alertas |
|---|---:|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
}

function writeInventory(markdown) {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, markdown, 'utf8');
}

function main() {
  const routes = collectInventory();
  const markdown = renderMarkdown(routes);
  const flags = new Set(process.argv.slice(2));

  if (flags.has('--json')) {
    process.stdout.write(`${JSON.stringify(routes, null, 2)}\n`);
    return;
  }

  if (flags.has('--check')) {
    const current = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, 'utf8') : '';
    if (current !== markdown) {
      process.stderr.write('El inventario de rutas está desactualizado. Ejecuta: npm run security:routes\n');
      process.exitCode = 1;
    }
    return;
  }

  if (flags.has('--write')) {
    writeInventory(markdown);
    process.stdout.write(`${normalizePath(path.relative(REPO_ROOT, OUTPUT_FILE))}\n`);
    return;
  }

  process.stdout.write(markdown);
}

if (require.main === module) main();

module.exports = {
  collectInventory,
  renderMarkdown,
};
