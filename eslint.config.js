import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

// The migration is done — src/, tests/ and database/ are all .ts, and the only .js
// file left in the repo is this config. Add a `**/*.js` block back if a .js/.cjs/.mjs
// tool config ever shows up; until then js.configs.recommended covers it.
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'coverage/**', 'dist/**'],
  },

  js.configs.recommended,

  // ── TypeScript ────────────────────────────────────────────────────────────
  // "recommended" plus a hand-picked set of type-aware rules, rather than the whole
  // recommendedTypeChecked preset.
  //
  // The full preset was measured against this codebase: 309 errors, of which 292 were
  // the no-unsafe-* family firing on `any` that comes from Express (req.body) and
  // supertest (res.body) — not ours to type away. The four rules enabled below are the
  // ones that found real defects (dropped promises in server.ts, a callback returning a
  // promise where void was expected) and settle at zero once fixed.
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      // turns on type information for the rules below
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      // tsc already reports undefined identifiers, and no-undef misfires on types/generics
      'no-undef': 'off',
      // the base rule cannot see type positions — use the TS-aware one instead
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // `any` is a legitimate temporary step mid-migration — flag it, don't block on it
      '@typescript-eslint/no-explicit-any': 'warn',
      // tsconfig has verbatimModuleSyntax:true, so type-only imports MUST be written
      // `import type {...}`. This rule auto-fixes them (npm run lint:fix).
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],

      // ── type-aware rules (need parserOptions.projectService above) ──
      // a dropped promise means an error nobody ever sees
      '@typescript-eslint/no-floating-promises': 'error',
      // an async callback handed to something expecting a void return — same failure mode
      '@typescript-eslint/no-misused-promises': 'error',
      // catches `${obj}` silently becoming '[object Object]'
      '@typescript-eslint/no-base-to-string': 'error',
      // an `as` that does nothing is usually a leftover from a since-fixed type
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',

      // ── general style, not TS-specific ──
      // Single quotes + all other formatting is enforced by Prettier (.prettierrc.json)
      'no-console': 'off',
      'no-process-exit': 'off',
      'prefer-const': 'warn',
      'no-var': 'error',
      eqeqeq: ['warn', 'smart'],
      'prettier/prettier': 'warn',
    },
  },

  prettierConfig,
);
