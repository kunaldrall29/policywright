// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // site/ is the docs site — its own package with its own tooling and CI job.
  // ._* is macOS AppleDouble metadata that appears on non-native filesystems.
  { ignores: ['node_modules/', 'dist/', 'out/', 'site/', 'contracts/', '**/._*'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Numbers/booleans interpolated into messages are intentional; bigints are
      // converted with .toString() explicitly before interpolation.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // The flat config file itself is plain JS, outside the typed program.
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
