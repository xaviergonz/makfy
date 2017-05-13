export interface ExecObject {
  _: string; // command name
  args?: {
    [argName: string]: string | boolean;
  };
}

export type ExecCommand = string | ExecObject | any[]; // should be ExecCommand[], but that gives a circular type

export type ExecFunction = (...commands: ExecCommand[]) => Promise<{ keepContext: ExecFunction }>;
