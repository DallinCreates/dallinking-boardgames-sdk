export function initDevkit(): {
  version: string;
};

export function runSandbox(options?: {
  cwd?: string;
  argv?: string[];
}): Promise<void>;

declare const _default: {
  initDevkit: typeof initDevkit;
  runSandbox: typeof runSandbox;
};

export default _default;