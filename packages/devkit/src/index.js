/**
 * @dallinking/boardgame-devkit
 * Development tools and utilities for dallinking boardgames
 */

import { runSandbox } from './sandbox.js';
import { stampReleaseConfig } from './stamp.js';
import { checkRelease, validateProjectConfig, REQUIRED_HOOKS } from './validate.js';
import { validateGameConfig } from './config-rules.js';
import { SDK_VERSION } from './version.js';

export { runSandbox, stampReleaseConfig, checkRelease, validateProjectConfig, validateGameConfig, REQUIRED_HOOKS };

/**
 * Initialize devkit utilities
 * @returns {Object} Devkit utilities
 */
export function initDevkit() {
  return {
    version: SDK_VERSION,
  };
}

export default {
  initDevkit,
  runSandbox,
  stampReleaseConfig,
  checkRelease,
  validateProjectConfig,
  validateGameConfig,
};
