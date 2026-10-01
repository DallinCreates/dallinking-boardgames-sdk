export function initDevkit(): {
  version: string;
};

export function runSandbox(options?: {
  cwd?: string;
  argv?: string[];
}): Promise<void>;

export function stampReleaseConfig(options?: {
  cwd?: string;
}): {
  configPath: string;
  sdkVersion: string;
};

export function validateProjectConfig(options?: {
  cwd?: string;
  /** Check dist/game.config.json instead of public/game.config.json. */
  dist?: boolean;
}): {
  config: Record<string, any>;
  configPath: string;
  warnings: string[];
};

export interface CheckResult {
  level: 'pass' | 'warn' | 'error';
  area: 'Config' | 'Players' | 'Cover' | 'Engine';
  message: string;
}

/** The full pre-upload check behind `boardgame-devkit validate`. */
export function checkRelease(options?: {
  cwd?: string;
  /** Check the built release in dist/ instead of public/ and src/. */
  dist?: boolean;
}): Promise<{
  ok: boolean;
  results: CheckResult[];
  errors: CheckResult[];
  warnings: CheckResult[];
}>;

/** Hooks every engine must implement. */
export const REQUIRED_HOOKS: string[];

/** Returns the first problem with a parsed game.config.json, or null. */
export function validateGameConfig(
  config: unknown,
  options?: { files?: string[]; filesLabel?: string }
): string | null;

declare const _default: {
  initDevkit: typeof initDevkit;
  runSandbox: typeof runSandbox;
  stampReleaseConfig: typeof stampReleaseConfig;
  checkRelease: typeof checkRelease;
  validateProjectConfig: typeof validateProjectConfig;
  validateGameConfig: typeof validateGameConfig;
};

export default _default;