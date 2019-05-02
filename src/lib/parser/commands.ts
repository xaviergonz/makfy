import { MakfyError } from "../errors";
import { validateInstance } from "../schema";
import { Commands, commandsSchema, isInternalCommand } from "../schema/commands";
import { errorMessageForObject } from "../utils/formatting";
import { isObject } from "../utils/typeChecking";
import { parseCommand, ParsedCommand } from "./command";

export interface ParsedCommands {
  [cmdName: string]: ParsedCommand;
}

export const parseCommands = (commands: Commands, skipValidation: boolean): ParsedCommands => {
  const error = (property: string | undefined, message: string): MakfyError => {
    return new MakfyError(errorMessageForObject(["commands", property], message), undefined);
  };

  if (!isObject(commands)) {
    throw error(undefined, `must be an object (did you export it?)`);
  }

  if (!skipValidation) {
    const validationResult = validateInstance(commands, commandsSchema);
    if (!validationResult.valid) {
      throw error(undefined, validationResult.toString());
    }
  }

  let publicCommands = 0;

  const parseInfo: ParsedCommands = {};

  Object.keys(commands).forEach((cmdName) => {
    const command = commands[cmdName];

    parseInfo[cmdName] = parseCommand(command, cmdName, true);

    if (!isInternalCommand(cmdName)) {
      publicCommands++;
    }
  });

  if (publicCommands <= 0) {
    throw error(undefined, `must have at least one command (not counting internal ones)`);
  }

  return parseInfo;
};
