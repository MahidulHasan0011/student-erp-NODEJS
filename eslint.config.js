import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

// During the TypeScript migration .js and .ts live side by side, so there are two
// parallel blocks below with deliberately matching rules — a file must not change
// behaviour just because it got renamed. Delete the .js block once src/ is fully .ts.
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'business-plan/**', 'coverage/**', 'dist/**'],
  },

  js.configs.recommended,

  // ── JavaScript ────────────────────────────────────────────────────────────
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-process-exit': 'off',
      'prefer-const': 'warn',
      'no-var': 'error',
      eqeqeq: ['warn', 'smart'],
      // Single quotes + all other formatting is enforced by Prettier (.prettierrc.json)
      'prettier/prettier': 'warn',
    },
  },

  // ── TypeScript ────────────────────────────────────────────────────────────
  // Non type-aware ("recommended", not "recommendedTypeChecked") on purpose: type-aware
  // linting needs a full program per lint run — slow, and noisy while half the codebase
  // is still untyped .js. Revisit in phase 7 once strict mode is on.
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
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

      // ── kept identical to the .js block above ──
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
