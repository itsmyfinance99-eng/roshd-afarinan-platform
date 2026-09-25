import globals from 'globals';
import { baseConfig } from './base.js';

/**
 * ESLint config for React libraries (packages/ui). The Next.js app layers
 * eslint-config-next on top of this in its own config.
 * @param {{ tsconfigRootDir: string }} options
 */
export function reactConfig(options) {
  return [...baseConfig(options), { languageOptions: { globals: { ...globals.browser } } }];
}
