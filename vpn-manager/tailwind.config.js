/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────
//  SISTEMA DE COLOR — Fuente única de verdad
//  Ver DESIGN_SYSTEM.md para la semántica completa.
//
//  Reglas de uso:
//   • brand   (indigo) → ACCIÓN primaria, links, foco. Solo interacción.
//   • success (emerald)→ ÉXITO / activo / conectado.
//   • danger  (rose)   → PELIGRO / desconectado / revocar / error.
//   • warning (amber)  → ADVERTENCIA / por expirar.
//   • info    (sky)    → INFORMATIVO neutro (subredes, datos secundarios).
//   • accent  (violet) → SOLO etiquetas de protocolo (WireGuard).
//   • neutral (slate)  → TEXTO, estructura, datos. ~80% de la UI.
// ─────────────────────────────────────────────────────────────

const palette = {
  indigo: {
    50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8',
    500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b',
  },
  emerald: {
    50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399',
    500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22',
  },
  rose: {
    50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185',
    500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519',
  },
  amber: {
    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
    500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03',
  },
  sky: {
    50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8',
    500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e', 950: '#082f49',
  },
  violet: {
    50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa',
    500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065',
  },
  slate: {
    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8',
    500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617',
  },
};

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paletas base (se mantienen los nombres por compatibilidad)
        indigo: palette.indigo,
        slate: palette.slate,
        // Alias semánticos — USA ESTOS en componentes nuevos
        brand: palette.indigo,
        success: palette.emerald,
        danger: palette.rose,
        warning: palette.amber,
        info: palette.sky,
        accent: palette.violet,
        neutral: palette.slate,

        // ── Tokens de superficie/texto (auto-conmutan claro↔oscuro) ──
        //  Manejados por variables CSS en index.css (:root y .dark).
        //  Úsalos como bg-surface, text-ink, border-line, etc.
        //
        //  Paleta MODO OSCURO:
        //   surface    #0f172a (slate-900)  — tarjetas/paneles
        //   surface-2  #1e293b (slate-800)  — elementos elevados/inputs
        //   page       #020617 (slate-950)  — fondo de página
        //   ink        #f1f5f9 (slate-100)  — texto principal
        //   ink-muted  #94a3b8 (slate-400)  — texto secundario
        //   line       #1e293b (slate-800)  — bordes
        surface: 'rgb(var(--c-surface-rgb) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2-rgb) / <alpha-value>)',
        page: 'rgb(var(--c-page-rgb) / <alpha-value>)',
        ink: 'rgb(var(--c-ink-rgb) / <alpha-value>)',
        'ink-muted': 'rgb(var(--c-ink-muted-rgb) / <alpha-value>)',
        line: 'rgb(var(--c-line-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Escala mínima: 12px es el piso legible (no usar text-[10px]/[11px])
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11px — SOLO micro-badges
      },
      borderRadius: {
        card: '1rem',     // rounded-2xl — contenedores
        control: '0.75rem', // rounded-xl — botones / inputs
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
}
