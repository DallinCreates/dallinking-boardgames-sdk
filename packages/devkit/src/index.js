/**
 * @dallinking/boardgame-devkit
 * Development tools and utilities for dallinking boardgames
 */

import { runSandbox } from './sandbox.js';

export { runSandbox };

/**
 * Initialize devkit utilities
 * @returns {Object} Devkit utilities
 */
export function initDevkit() {
  return {
    version: '0.0.1',
  };
}

export default {
  initDevkit,
  runSandbox,
};
