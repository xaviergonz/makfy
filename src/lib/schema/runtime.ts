export interface ExecObject {
  _: string; // command name
  args?: {
    [argName: string]: string | boolean;
  };
}

export type ExecCommand = string | ExecObject;

export type ExecFunction = (...commands: ExecCommand[]) => Promise<{ keepContext: ExecFunction }>;
