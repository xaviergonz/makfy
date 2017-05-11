import { parseArgDefinition, ParsedArgDefinition } from './commandArg';
import { MakfyError } from './errors';
import { validateInstance } from './schema';
import { Command, commandSchema } from './schema/commands';
import { errorMessageForObject } from './utils';

export interface ParsedCommand {
  argDefinitions: {
    [argName: string]: ParsedArgDefinition
  };
}

export const parseCommand = (command: Command, cmdName: string, skipValidation: boolean): ParsedCommand => {
  const error = (property: string | undefined, message: string): MakfyError => {
    return new MakfyError(errorMessageForObject(['commands', cmdName, property], message));
  };

  if (!skipValidation) {
    const validationResult = validateInstance(command, commandSchema);
    if (!validationResult.valid) {
      throw error(undefined, validationResult.toString());
    }
  }

  const { args } = command;

  // parse
  const cmdInfo: ParsedCommand = {
    argDefinitions: {}
  };

  if (args !== undefined) {
    Object.keys(args).forEach((argName) => {
      const argDefinition = args[argName];
      cmdInfo.argDefinitions[argName] = parseArgDefinition(cmdName, argName, argDefinition, true);
    });
  }

  return cmdInfo;
};
