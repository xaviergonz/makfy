import { ParsedCommands } from "../parser/commands";
import { HashCollection } from "../utils/hash";
import { Commands } from "./commands";
import { FullOptions } from "./options";

export interface ExecObject {
  _: string; // command name
  args?: {
    [argName: string]: string | boolean;
  };
}

export type ExecCommand = string | ExecObject | (string | ExecObject)[];

export type ExecFunction = (...commands: ExecCommand[]) => Promise<{ keepContext: ExecFunction }>;

export interface ExtendedFullOptions extends FullOptions {
  colorMode: boolean;
}

export interface MakfyContext {
  commandName: string;
  commandArgs: object;
  commands: Commands;
  options: ExtendedFullOptions;
  makfyFilename: string;
}

export interface GetFileChangesResult {
  hasChanges: boolean;
  cleanRun: boolean;
  added: string[];
  removed: string[];
  modified: string[];
  unmodified: string[];
}

export interface CachedGetFileChangesResult {
  result: GetFileChangesResult;
  oldHashCollection?: HashCollection;
  newHashCollection: HashCollection;
}

export interface ExecContext extends MakfyContext {
  parsedCommands: ParsedCommands;
  makfyFileContents?: string;

  idStack: string[];
  cwd?: string;
  env?: object;
  syncMode: boolean;

  getFileChangesResults: {
    [hashFilename: string]: CachedGetFileChangesResult;
  };
}
