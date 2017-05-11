import * as chalk from 'chalk';
import { parseCommands } from './commands';
import { MakfyError } from './errors';
import { MakfyInstance } from './MakfyInstance';
import { Options, parseOptions } from './options';
import { Commands } from './schema/commands';
import { errorMessageForObject, getTimeString, isObject, resetColors, Writer } from './utils';
const prettyHrTime = require('pretty-hrtime');

const logWarn = (str: string) => {
  console.error(chalk.dim.yellow(`[WARN] ${str}`));
};

export const runCommand = (commands: Commands, commandName: string, commandArgs: object, options?: Options) => {
  if (!commandName) {
    throw new MakfyError('No command name');
  }

  const fullOptions = parseOptions(options, false);

  const parsedCommands = parseCommands(commands, false);
  const parsedCommand = parsedCommands[commandName];
  if (!parsedCommand) {
    throw new MakfyError(`command '${commandName}' not found`);
  }

  if (commands[commandName].internal) {
    throw new MakfyError('internal commands cannot be run directly');
  }

  const argDefs = parsedCommand.argDefinitions;

  // warn for ignored args
  Object.keys(commandArgs).forEach((key) => {
    const argDef = argDefs[key];
    if (!argDef) {
      logWarn(`argument '${key}' is not defined as a valid argument for this command and will be ignored`);
    }
  });

  // validate arguments and set default values
  const finalCommandArgs = {};
  Object.keys(argDefs).forEach((key) => {
    const argDef = argDefs[key];
    finalCommandArgs[key] = argDef.parse(commandArgs[key]);
  });

  // run
  const startTime = process.hrtime();
  console.log(chalk.bgBlue.bold.white(`running command '${commandName}'...`));

  const mf = new MakfyInstance(fullOptions, finalCommandArgs);
  commands[commandName].run(mf.exec, finalCommandArgs);

  const endTime = process.hrtime(startTime);
  console.log('\n' + getTimeString() + chalk.bgGreen.bold.white(`'${commandName}' done in ${prettyHrTime(endTime)}`));
  resetColors();
};

export const listCommand = (commands: Commands, commandName: string, listArguments = true) => {
  if (!commandName) {
    throw new MakfyError('missing command name');
  }

  const w = new Writer();

  // this also makes sure the command exists
  const parsedCommands = parseCommands(commands, false);
  const parsedCommand = parsedCommands[commandName];
  if (!parsedCommand) {
    throw new MakfyError(`command '${commandName}' not found`);
  }

  const command = commands[commandName];

  let title = commandName;
  if (command.desc !== undefined) {
    title += ` - ${command.desc}`;
  }
  w.writeLine(title);

  if (listArguments) {
    const argDefs = parsedCommand.argDefinitions;
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
    throw new MakfyError(errorMessageForObject(['commands'], `must be an object (did you export it?)`));
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
