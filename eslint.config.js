// Lints the API, core and scripts. The app has its own Expo config (apps/mobile/eslint.config.cjs);
// `pnpm lint` runs both.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['apps/mobile/**', '**/node_modules/**', '**/dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Scripts and tests read untyped MCP and JSON responses.
  { files: ['**/scripts/**', '**/test/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
