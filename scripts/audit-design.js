#!/usr/bin/env node
// ============================================================
//  audit-design.js — auditor del sistema de diseño del frontend
//
//  Recorre vpn-manager/src/**/*.{ts,tsx} y reporta violaciones
//  a las reglas de CLAUDE.md + DESIGN_SYSTEM.md:
//
//   DS01 — color fuera de la paleta permitida
//   DS02 — fondo claro sin variante dark:
//   DS03 — texto < text-xs (12px); excepción: text-2xs (11px reservado)
//   DS04 — gradiente multicolor (paletas distintas)
//   DS05 — texto slate-300/400 — posible contraste insuficiente
//   DS06 — botón con bg+text inline sin usar clase .btn-*
//
//  Output: tabla resumen + top 10 archivos + sample lines.
//  Uso:
//    node scripts/audit-design.js              # reporte legible
//    node scripts/audit-design.js --json       # JSON (CI)
//    node scripts/audit-design.js --rule DS02  # solo una regla
// ============================================================

const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', 'vpn-manager', 'src');

// ── Paletas permitidas (CLAUDE.md) ───────────────────────────────
const ALLOWED_PALETTES = new Set([
  'indigo', 'emerald', 'rose', 'amber', 'sky', 'violet', 'slate',
  // §54: cyan agregado como paleta semántica para CPEs/clientes
  // (nodos terminales en jerarquía de red, distintos de APs que usan
  // violet=infra/WireGuard). Documentado en CLAUDE.md.
  'cyan',
  // tokens semánticos del tailwind.config.js
  'brand', 'success', 'danger', 'warning', 'info', 'accent', 'neutral',
  // utility colors permitidos (transparentes / contraste)
  'white', 'black', 'transparent', 'current', 'inherit',
]);

// Paletas Tailwind prohibidas por CLAUDE.md (cada color tiene un dueño semántico).
const FORBIDDEN_PALETTES = [
  'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
  'gray', 'zinc', 'neutral', 'stone', 'teal', 'lime', 'fuchsia',
];

// Shades claros que típicamente necesitan dark variant para no quedar blancos en dark mode.
// Negative lookahead `(?!\/\d)` excluye sufijos de opacidad (`bg-white/20`, `bg-slate-50/40`):
// esos overlays viven sobre superficies oscuras permanentes y NO necesitan variant dark —
// el overlay funciona igual en light y dark mode. Documentado en §48 (Fase 6 del plan).
const LIGHT_SHADES_RE = /\bbg-(?:white|(?:indigo|emerald|rose|amber|sky|violet|slate|brand|success|danger|warning|info|accent|neutral)-(?:50|100|200))(?!\/\d)\b/g;

// ── Reglas ───────────────────────────────────────────────────────
const RULES = [
  {
    id: 'DS01-disallowed-palette',
    severity: 'error',
    title: 'Color fuera de la paleta semántica',
    rationale: 'CLAUDE.md restringe la UI a indigo/emerald/rose/amber/sky/violet/slate (y tokens brand/success/...).',
    test: (line) => {
      const violations = [];
      // bg-X-N, text-X-N, border-X-N, hover:bg-X-N, dark:text-X-N/X, etc.
      const re = /(?:^|[\s"'`{>])(?:hover:|focus:|active:|disabled:|group-hover:|peer:|dark:|sm:|md:|lg:|xl:|2xl:|first:|last:|odd:|even:)*(?:bg|text|border|ring|outline|from|to|via|fill|stroke|shadow|divide|placeholder|caret|accent|decoration)-([a-z]+)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const palette = m[1];
        if (FORBIDDEN_PALETTES.includes(palette)) {
          violations.push(`palette '${palette}' no permitida`);
        }
      }
      return violations;
    },
  },
  {
    id: 'DS02-bg-without-dark',
    severity: 'warning',
    title: 'Fondo claro sin variante dark:',
    rationale: 'En modo oscuro el fondo claro queda blanco/casi-blanco y el contenido se vuelve invisible. Agrega dark:bg-... o usa una clase del sistema (.card / .input-field / etc).',
    test: (line) => {
      const matches = line.match(LIGHT_SHADES_RE);
      if (!matches) return [];
      // dark: con cualquier variant intermedia (hover/focus/group-hover/etc.) seguida de bg-
      if (/\bdark:[^\s"'`]*bg-/.test(line)) return [];
      // Excepciones: si la línea ya usa una clase del sistema (.card / .btn-*) — esas manejan dark internamente.
      if (/\b(card|card-hover|btn-(?:primary|success|danger|warning|outline|ghost)|input-field|badge|data-cell|data-muted|th-cell|status-live|skeleton|reveal-stagger)\b/.test(line)) return [];
      return matches.map(m => `${m} sin dark variant`);
    },
  },
  {
    id: 'DS03-text-too-small',
    severity: 'error',
    title: 'Tamaño de texto < 12px',
    rationale: 'CLAUDE.md fija text-xs (12px) como mínimo. text-2xs (11px) y text-3xs (9px) están reservados para micro-badges en tablas densas; usa esas clases en lugar de text-[Npx] literal.',
    test: (line) => {
      const violations = [];
      const re = /\btext-\[(\d+)px\]/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const px = parseInt(m[1], 10);
        if (px < 12) violations.push(`text-[${px}px] (< 12px)`);
      }
      return violations;
    },
  },
  {
    id: 'DS04-multicolor-gradient',
    severity: 'warning',
    title: 'Gradiente multicolor (mezcla paletas)',
    rationale: 'Un estado = un color. CLAUDE.md prohíbe gradients como from-emerald-X to-sky-Y; rompen la legibilidad semántica.',
    test: (line) => {
      const violations = [];
      // Captura from-PALETTE-N y to-PALETTE-N para comparar paletas.
      const fromMatches = [...line.matchAll(/\bfrom-([a-z]+)-\d+/g)];
      const toMatches   = [...line.matchAll(/\bto-([a-z]+)-\d+/g)];
      // viaMatches también ayuda pero suelen ser el mismo color base.
      for (const f of fromMatches) {
        for (const t of toMatches) {
          if (f[1] !== t[1]) {
            violations.push(`from-${f[1]}-* → to-${t[1]}-* (paletas distintas)`);
            break;
          }
        }
      }
      return violations;
    },
  },
  {
    id: 'DS05-low-contrast-text',
    severity: 'info',
    title: 'Texto slate-300/400 sobre fondo claro — posible contraste insuficiente',
    rationale: 'CLAUDE.md pide labels mínimo slate-600 sobre fondo blanco para contraste AA. slate-300/400 funcionan solo sobre fondos oscuros.',
    test: (line, ctx) => {
      // Solo dispara si la clase NO está en variante dark:
      const re = /(?:^|[\s"'`])text-slate-(300|400)\b/g;
      const violations = [];
      let m;
      while ((m = re.exec(line)) !== null) {
        const start = m.index;
        // Skip si la ocurrencia está después de "dark:"
        const before = line.slice(Math.max(0, start - 6), start);
        if (/dark:$/.test(before)) continue;
        violations.push(`text-slate-${m[1]}`);
      }
      if (violations.length === 0) return [];

      // Refinamiento §53: el text-slate-300/400 es legítimo (NO falso positivo)
      // cuando vive sobre una superficie OSCURA permanente. Detectamos contexto
      // mirando la línea actual + 3 previas (ctx.prev3) por:
      //   - Clases bg oscuras: bg-slate-{700-950}, bg-{tone}-{500-800},
      //     bg-gradient-to-*, bg-black
      //   - Sistema de modal-header decorativo (modal-header-{tone},
      //     modal-header-decorated, modal-header-slate)
      //   - text-white (compañero típico de overlay sobre dark)
      // Si alguno está presente, el slate-400 funciona BIEN ahí (contraste OK
      // contra fondo oscuro) y descartamos el hallazgo.
      const context = (ctx?.prev3 || '') + '\n' + line;
      const DARK_SURFACE_RE = /(?:bg-slate-(?:700|800|900|950)|bg-(?:indigo|rose|violet|emerald|sky|amber)-(?:500|600|700|800)|bg-gradient-to-|bg-black|modal-header-(?:decorated|indigo|rose|amber|emerald|sky|violet|slate)|text-white\b|text-white\/)/;
      if (DARK_SURFACE_RE.test(context)) return [];

      // Refinamiento §53-b: si la MISMA línea tiene `dark:text-slate-{500-700}`
      // o `dark:text-slate-{300-400}`, el desarrollador ya tomó una decisión
      // consciente del par claro/oscuro (patrón `.data-muted` etc.). No marca.
      // Esto NO es 100% defensible (slate-300 en claro sigue siendo bajo
      // contraste técnicamente), pero respeta la intención del diseño en el
      // patrón "valor vacío sutil" que es legítimo en tablas densas.
      if (/\bdark:text-slate-(?:300|400|500|600|700)\b/.test(line)) return [];

      // Refinamiento §53-c: si la clase está dentro de un `<Icon>` (lucide-react)
      // como className, es para tinte del SVG, no texto leíble. Saltar.
      // Heurística: la línea contiene `<[A-Z]\w+ className="..."` + size class
      // (w-3 / w-4 / w-3.5 etc.) — patrón típico de íconos.
      if (/<[A-Z]\w+ [^>]*className=["'`][^"'`]*\bw-(?:2|2\.5|3|3\.5|4|5)\b/.test(line)) return [];

      return violations;
    },
  },
  {
    id: 'DS06-raw-button-color',
    severity: 'info',
    title: 'Botón con bg+text inline en vez de usar clase del sistema',
    rationale: 'CLAUDE.md define .btn-primary / .btn-success / .btn-danger / .btn-warning / .btn-outline / .btn-ghost. Los botones inline pierden la consistencia (active:scale, shadow, dark mode, focus ring).',
    test: (line, ctx) => {
      // Solo dispara dentro de bloques de JSX que parecen pertenecer a un
      // <button>. Como el regex es por línea, miramos las 3 líneas previas
      // del contexto para confirmar que es un <button ...>; si no, lo
      // dejamos pasar (puede ser <span>, <div> con bg, badge, etc.).
      const prev = ctx?.prev3 || '';
      const isButtonish = /<button\b/.test(prev) || /<button\b/.test(line);
      if (!isButtonish) return [];
      // Si ya usa una clase del sistema, OK.
      if (/\b(btn-(?:primary|success|danger|warning|info|accent|outline|ghost)|badge-(?:success|danger|warning|info|neutral|accent))\b/.test(line)) return [];
      // Solo si tiene tanto bg-...-{500|600|700} como text-white (botón sólido inline).
      const hasSolid = /\bbg-(indigo|emerald|rose|amber|sky|violet|brand|success|danger|warning|info|accent)-(500|600|700)\b.*\btext-white\b/.test(line);
      if (hasSolid) return ['botón sólido sin clase .btn-*'];
      return [];
    },
  },
];

// ── Walker ───────────────────────────────────────────────────────
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
      walk(full, files);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
      files.push(full);
    }
  }
  return files;
}

// ── Audit ────────────────────────────────────────────────────────
function audit(opts = {}) {
  const files = walk(SRC_ROOT);
  const findings = []; // { file, line, ruleId, severity, message }
  const ruleFilter = opts.rule || null;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    // §54: detectar comentarios "audit:ignore-file <DS01|DS02|...|all>" en
    // las primeras 5 líneas del archivo. Permite silenciar reglas para
    // archivos que tienen excepciones documentadas (ej. constants.ts con
    // PEER_COLOR_PALETTE de 10 paletas para distinguir N peers).
    const fileHeader = lines.slice(0, 5).join('\n');
    const fileIgnoreMatch = fileHeader.match(/audit:ignore-file\s+([A-Z0-9,\s]+|all)/);
    const fileIgnoredRules = new Set();
    if (fileIgnoreMatch) {
      const tokens = fileIgnoreMatch[1].split(/[,\s]+/).filter(Boolean);
      tokens.forEach(t => fileIgnoredRules.add(t.toUpperCase()));
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // ignora líneas de comentario puro
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) continue;

      // §54: detectar comentario inline `// audit:ignore <ruleId>` en la
      // línea actual o la siguiente (a veces el comentario va arriba).
      // Permite silenciar UNA regla en UNA línea específica.
      const inlineIgnoreCtx = line + '\n' + (lines[i + 1] || '') + '\n' + (lines[i - 1] || '');
      const inlineIgnore = new Set([...fileIgnoredRules]);
      const inlineMatches = inlineIgnoreCtx.matchAll(/audit:ignore\s+([A-Z0-9,\s]+|all)/g);
      for (const m of inlineMatches) {
        m[1].split(/[,\s]+/).filter(Boolean).forEach(t => inlineIgnore.add(t.toUpperCase()));
      }

      // Contexto: 3 líneas previas para reglas que necesitan saber si el
      // bloque actual pertenece a un <button> (ver DS06).
      const prev3 = lines.slice(Math.max(0, i - 3), i).join('\n');
      const ctx = { prev3 };
      for (const rule of RULES) {
        if (ruleFilter && rule.id !== ruleFilter && !rule.id.startsWith(ruleFilter)) continue;
        // §54: respetar audit:ignore (file-level o inline).
        const ruleShort = rule.id.split('-')[0]; // DS01, DS02, ...
        if (inlineIgnore.has('ALL') || inlineIgnore.has(ruleShort)) continue;
        const violations = rule.test(line, ctx);
        for (const v of violations) {
          findings.push({
            file: path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/'),
            line: i + 1,
            ruleId: rule.id,
            severity: rule.severity,
            message: v,
            snippet: line.trim().slice(0, 140),
          });
        }
      }
    }
  }
  return { files: files.length, findings };
}

// ── Report ───────────────────────────────────────────────────────
const COLORS = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
  red:   '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue:  '\x1b[34m',
  cyan:  '\x1b[36m',
  gray:  '\x1b[90m',
};
const C = (k, s) => process.stdout.isTTY ? `${COLORS[k]}${s}${COLORS.reset}` : s;

function severityColor(sev) {
  if (sev === 'error') return 'red';
  if (sev === 'warning') return 'yellow';
  return 'cyan';
}

function report(audited) {
  const { files, findings } = audited;
  console.log('');
  console.log(C('bold', '🎨 Audit de Sistema de Diseño · ') + C('gray', `${files} archivos analizados`));
  console.log(C('dim', '   Reglas en CLAUDE.md + DESIGN_SYSTEM.md + tailwind.config.js'));
  console.log('');

  if (findings.length === 0) {
    console.log(C('green', '✓ Sin violaciones detectadas.'));
    return;
  }

  // Resumen por regla
  const byRule = {};
  for (const f of findings) {
    if (!byRule[f.ruleId]) byRule[f.ruleId] = { count: 0, severity: f.severity, title: '', files: new Set() };
    byRule[f.ruleId].count++;
    byRule[f.ruleId].files.add(f.file);
  }
  for (const rule of RULES) {
    if (byRule[rule.id]) byRule[rule.id].title = rule.title;
  }

  console.log(C('bold', 'Resumen por regla:'));
  console.log('  ' + C('gray', 'Severidad  Regla                          Violaciones  Archivos'));
  const sortedRules = Object.entries(byRule).sort((a, b) => b[1].count - a[1].count);
  for (const [ruleId, info] of sortedRules) {
    const sevTag = C(severityColor(info.severity), info.severity.padEnd(9));
    const idTag  = ruleId.padEnd(30);
    console.log(`  ${sevTag}  ${C('bold', idTag)}  ${String(info.count).padStart(11)}  ${String(info.files.size).padStart(8)}`);
    console.log(`             ${C('dim', info.title)}`);
  }
  console.log('');

  // Top 10 archivos
  const byFile = {};
  for (const f of findings) {
    byFile[f.file] = (byFile[f.file] || 0) + 1;
  }
  const topFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(C('bold', 'Top 10 archivos por violaciones:'));
  for (const [file, count] of topFiles) {
    console.log(`  ${String(count).padStart(4)}  ${C('cyan', file)}`);
  }
  console.log('');

  // Samples (máx 3 por regla)
  console.log(C('bold', 'Ejemplos (máx 3 por regla):'));
  for (const rule of RULES) {
    const matches = findings.filter(f => f.ruleId === rule.id);
    if (matches.length === 0) continue;
    console.log('');
    console.log(`  ${C(severityColor(rule.severity), rule.id)} · ${C('bold', rule.title)}`);
    console.log(`  ${C('dim', rule.rationale)}`);
    for (const f of matches.slice(0, 3)) {
      console.log(`    ${C('gray', `${f.file}:${f.line}`)}  ${C('yellow', f.message)}`);
      console.log(`    ${C('dim', `      ${f.snippet}`)}`);
    }
    if (matches.length > 3) {
      console.log(`    ${C('gray', `… y ${matches.length - 3} más`)}`);
    }
  }

  console.log('');
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const infos = findings.filter(f => f.severity === 'info').length;
  console.log(C('bold', `Total: ${findings.length}  `) +
    C('red', `${errors} errores · `) +
    C('yellow', `${warnings} warnings · `) +
    C('cyan', `${infos} infos`));
  console.log('');
}

// ── CLI ──────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') opts.json = true;
    if (args[i] === '--rule') opts.rule = args[++i];
  }
  const audited = audit(opts);
  if (opts.json) {
    console.log(JSON.stringify({ files: audited.files, total: audited.findings.length, findings: audited.findings }, null, 2));
  } else {
    report(audited);
  }
  // Exit code: 1 si hay errores (severity=error), 0 si solo warnings/infos.
  const hasErrors = audited.findings.some(f => f.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

main();
