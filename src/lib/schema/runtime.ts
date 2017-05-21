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
  getFileChangesAsync(contextName: string, globPatterns: string[] | string, options?: Partial<GetFileChangesOptions>): Promise<GetFileChangesResult>;
  cleanCache(): void;
  escape(...parts: string[]): string;
  fixPath(path: string, style: 'autodetect' | 'windows' | 'posix'): string;
  setEnvVar(name: string, value: string | undefined): string;
}
