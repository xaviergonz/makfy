import { MakfyError } from './errors';
import { isObject, isFunction, isAlphanumericString } from './utils';
import { parseArgDefinition, ArgDefinition } from './argDefinitonParser';

export interface Command {
  desc?: string;
  args: {
    [argName: string]: ArgDefinition;
  };
  internal?: boolean;
  // TODO: properly define exec
  run(exec: any, args: object): void;
}

export interface Commands {
  [commandName: string]: Command;
}

export const parseCommands = (commands: Commands, commandName: string | undefined) => {
  if (!isObject(commands)) {
    throw new MakfyError(`'commands' must be an object (did you export it?)`);
  }

  let publicCommands = 0;

  const parseInfo = {};

  // make sure every command is an object and has a run function, an optional desc string and that the args are ok
  Object.keys(commands).forEach((cmdName) => {
    const command = commands[cmdName];

    const error = (err: string) => {
      throw new MakfyError(`Command '${cmdName}' - ${err}`);
    };

    // validation
    if (!isAlphanumericString(cmdName)) {
      error(`name must be alphanumeric`);
    }

    if (!isObject(command)) {
      error(`must be an object`);
    }

    const { run, args, desc } = command;

    if (!isFunction(run)) {
      error(`'run' property must be a function and be present`);
    }

    if (args !== undefined && !isObject(args)) {
      error(`'args' property must be an object if present`);
    }

    if (desc !== undefined && typeof desc !== 'string') {
      error(`'desc' property must be a string if present`);
    }

    // parse
    const cmdInfo = {
      argDefinitions: {}
    };

    if (args !== undefined) {
      Object.keys(args).forEach((argName) => {
        const argDefinition = args[argName];
        cmdInfo.argDefinitions[argName] = parseArgDefinition(cmdName, argName, argDefinition);
      });
    }

    parseInfo[cmdName] = cmdInfo;

    if (!command.internal) {
      publicCommands++;
    }
  });

  if (publicCommands <= 0) {
    throw new MakfyError(`'commands' must have at least one command (not counting internals)`);
  }

  if (commandName) {
    const command = commands[commandName];
    if (!command) {
      throw new MakfyError(`Command '${commandName}' not found`);
    }
  }

  return parseInfo;
};
