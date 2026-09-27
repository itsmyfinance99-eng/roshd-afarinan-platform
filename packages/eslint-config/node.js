import globals from 'globals';
import { baseConfig } from './base.js';

/**
 * ESLint config for Node/NestJS packages.
 * @param {{ tsconfigRootDir: string }} options
 */
export function nodeConfig(options) {
  return [
    ...baseConfig(options),
    {
      languageOptions: { globals: { ...globals.node } },
      rules: {
        // NestJS DI needs runtime class references in constructor params
        '@typescript-eslint/consistent-type-imports': 'off',
      },
    },
  ];
}
