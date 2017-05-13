import { Command } from './commands';

export interface ExecObject {
  _: string | Command; // command name or actual command object
  args?: {
    [argName: string]: string | boolean;
  };
}

export type ExecCommand = string | ExecObject;

export type ExecFunction = (...commands: ExecCommand[]) => Promise<{ keepContext: ExecFunction }>;
