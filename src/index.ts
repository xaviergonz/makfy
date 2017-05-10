import * as colors from 'colors/safe';

import { resetColors, isObject, getTimeString } from './utils';
import { parseCommands, Commands } from './commandParser';
import { parseOptions, Options } from './options';
import { MakfyError } from './errors';
import { Makfy } from './Makfy';

class Writer {
  output: string = '';

  writeLine(str?: string) {
    this.output += (str ? str : '') + '\n';
  }
}

export const runCommand = (commands: Commands, commandName: string, commandArgs: object, options?: Options) => {
  if (!commandName) {
    throw new MakfyError('No command name');
  }

  // this also validates the options
  const fullOptions = parseOptions(options);

  // this also makes sure the command exists
  const commandsInfo = parseCommands(commands, commandName);
  const commandInfo = commandsInfo[commandName];

  if (commands[commandName].internal) {
    throw new MakfyError('Internal commands cannot be run directly');
  }

  const argDefs = commandInfo.argDefinitions;

  // warn for ignored args
  Object.keys(commandArgs).forEach((key) => {
    const argDef = argDefs[key];
    if (!argDef) {
      console.error(colors.magenta(`[WARN] Argument '${key}' is not defined as a valid argument for this command and will be ignored`));
    }
  });

  // validate arguments and set default values
  const finalCommandArgs = {};
  Object.keys(argDefs).forEach((key) => {
    const argDef = argDefs[key];
    finalCommandArgs[key] = argDef.parse(commandArgs[key]);
  });

  // run
  const startTime = Date.now();
  console.log(colors.bgBlue(colors.bold(colors.white(`Running command '${commandName}'...`))));

  const mf = new Makfy(fullOptions, finalCommandArgs);
  commands[commandName].run(mf.exec, finalCommandArgs);

  console.log('\n' + getTimeString() + colors.bgGreen.bold.white(`'${commandName}' done in ${Date.now() - startTime} msecs!`));
  resetColors();
};

export const listCommand = (commands: Commands, commandName: string, listArguments = true) => {
  if (!commandName) {
    throw new MakfyError('No command name');
  }

  const w = new Writer();

  // this also makes sure the command exists
  const commandsInfo = parseCommands(commands, commandName);

  const command = commands[commandName];
  const commandInfo = commandsInfo[commandName];

  let title = commandName;
  if (command.desc !== undefined) {
    title += ` - ${command.desc}`;
  }
  w.writeLine(title);

  if (listArguments) {
    const argDefs = commandInfo.argDefinitions;
    const hasArgs = Object.keys(argDefs).length > 0;
    if (hasArgs) {
      w.writeLine('-- Arguments:');
      Object.keys(argDefs).forEach((key) => {
        const argDef = argDefs[key];
        w.writeLine(`   + ${argDef.help}`);
      });
    }
    else {
      w.writeLine('-- No arguments');
    }
  }

  return w.output;
};

export const listAllCommands = (commands: Commands, listArguments = true, listInternal = false) => {
  if (!isObject(commands)) {
    throw new MakfyError(`'commands' must be an object (did you export it?)`);
  }

  let output = '';

  for (const commandName of Object.keys(commands)) {
    const command = commands[commandName];
    if (!command.internal || listInternal) {
      output += listCommand(commands, commandName, listArguments) + '\n';
    }
  }

  return output;
};
