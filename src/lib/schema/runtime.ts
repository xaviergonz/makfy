import { Command } from './commands';

export type ExecCommand = string | (() => any) | Command;
export type ExecFunction = (...commands: ExecCommand[]) => void;
