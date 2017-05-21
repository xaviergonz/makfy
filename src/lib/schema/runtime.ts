export interface ExecObject {
  _: string; // command name
  args?: {
    [argName: string]: string | boolean;
  };
}

export type ExecCommand = string | ExecObject | any[]; // should be ExecCommand[], but that gives a circular type

export type ExecFunction = (...commands: ExecCommand[]) => Promise<{ keepContext: ExecFunction }>;

export interface GetFileChangesOptions {
  log: boolean;
}

export interface GetFileChangesResult {
  hasChanges: boolean;
  cleanRun: boolean;
  added: string[];
  removed: string[];
  modified: string[];
  unmodified: string[];
}

export interface ExecUtils {
  escape(...parts: string[]): string;
  fixPath(path: string, style: 'autodetect' | 'windows' | 'posix'): string;
  setEnvVar(name: string, value: string | undefined): string;
  expandGlobsAsync(globPatterns: string[]): Promise<string[]>;
  getFileChangesAsync(contextName: string, globPatterns: string[] | string, options?: Partial<GetFileChangesOptions>): Promise<GetFileChangesResult>;
  cleanCache(): void;

  // internal only for now
  limitPromiseConcurrency<T>(concurrency: number): (fn: () => PromiseLike<T>) => Promise<T>;
}
