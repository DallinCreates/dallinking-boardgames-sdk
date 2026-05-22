declare const process: {
  argv: string[];
  exit(code?: number): never;
};

declare const console: {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

declare module 'node:fs' {
  export const existsSync: any;
  export const mkdirSync: any;
  export const writeFileSync: any;
  export const readFileSync: any;
}

declare module 'node:path' {
  export const resolve: any;
  export const basename: any;
  export const join: any;
  export const dirname: any;
}