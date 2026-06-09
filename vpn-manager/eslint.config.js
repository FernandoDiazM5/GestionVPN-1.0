import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // ────────────────────────────────────────────────────────────
      // DEUDA TÉCNICA — reglas bajadas a 'warn' temporalmente (FASE 0).
      // El REFACTOR_PLAN.md las sube a 'error' en las fases indicadas.
      // No agregar NUEVOS warnings de estas reglas en código nuevo.
      // ────────────────────────────────────────────────────────────

      // 24 ocurrencias preexistentes — FASE 5 (contratos Zod compartidos)
      '@typescript-eslint/no-explicit-any': 'warn',

      // 17 ocurrencias — FASE 4 (después de tener tests que cubran cada hook)
      'react-hooks/exhaustive-deps': 'warn',

      // 11 ocurrencias — riesgo bajo, F8 al separar god-components
      'no-empty': 'warn',

      // 10 ocurrencias — patrones legacy del backup; F8/F10 los pule
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',

      // 9 ocurrencias — F5 (al revisar tipos)
      '@typescript-eslint/no-unused-vars': 'warn',

      // 4 ocurrencias — refactor de archivos donde se mezcla componente + helpers
      'react-refresh/only-export-components': 'warn',

      // 2 ocurrencias — patrones de side-effect intencionales en hooks
      '@typescript-eslint/no-unused-expressions': 'warn',

      // 2 ocurrencias — F4/F8 (después de tests; tocan render purity)
      'react-hooks/purity': 'warn',

      // 1 ocurrencia — patrón useLatest legacy en useWorkspaceEvents; F4/F8
      'react-hooks/refs': 'warn',

      // 1 ocurrencia — F5 (al normalizar tipos compartidos)
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  },
])
