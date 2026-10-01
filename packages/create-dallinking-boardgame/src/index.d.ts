export const DOCS_URL: string;

export interface ScaffoldOptions {
  /** Display name. Defaults to the folder name in Title Case. */
  name?: string;
  /** Run npm install. Defaults to true. */
  install?: boolean;
  /** Create a git repository with a first commit. Defaults to true. */
  git?: boolean;
  log?: (message: string) => void;
}

export interface ScaffoldResult {
  targetDir: string;
  gameId: string;
  gameName: string;
  installed: boolean;
  gitInitialized: boolean;
}

export function scaffoldProject(projectDir: string, options?: ScaffoldOptions): ScaffoldResult;

/** "My Game!" -> "my-game" */
export function toGameId(folderName: string): string;

/** "my-game" -> "My Game" */
export function toGameName(folderName: string): string;

declare const _default: {
  scaffoldProject: typeof scaffoldProject;
  toGameId: typeof toGameId;
  toGameName: typeof toGameName;
};

export default _default;
