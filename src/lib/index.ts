import * as chalk from 'chalk';
import { MakfyError, RunError } from './errors';
import { MakfyInstance, RunContext } from './MakfyInstance';
import { parseOptions } from './options';
import { ParsedArgDefinition } from './parser/commandArg';
import { parseCommands } from './parser/commands';
import { Commands } from './schema/commands';
import { errorMessageForObject, getTimeString, isObject, resetColors, TextWriter } from './utils';
const prettyHrTime = require('pretty-hrtime');
const entries = require('object.entries');

const logWarn = (commandName: string, str: string) => {
  console.error(chalk.bold.blue(`@${commandName}`) + ' - ' + chalk.dim.red(`[WARN] ${str}`));
};

export const runCommand = (commands: Commands, commandName: string, runContext: RunContext) => {
  if (!commandName) {
    throw new MakfyError('command name missing');
  }

  const rc = { ...runContext };
  rc.args = rc.args || {};
  const {internal, args, options} = rc;

  rc.options = parseOptions(options, false);

  const parsedCommands = parseCommands(commands, false);
  const parsedCommand = parsedCommands[commandName];
  if (!parsedCommand) {
    throw new MakfyError(`command '${commandName}' not found`);
  }

  if (!internal && commands[commandName].internal) {
    throw new MakfyError('internal commands cannot be run directly');
  }

  if (!internal) {
    console.log(chalk.bgBlue.bold.white(`@${commandName} - running...`));
  }

  const argDefs = parsedCommand.argDefinitions;

  // warn for ignored args
  Object.keys(args).forEach((key) => {
    const argDef = argDefs[key];
    if (!argDef) {
      logWarn(commandName, `argument '${key}' is not defined as a valid argument for this command and will be ignored`);
    }
  });

  // validate arguments and set default values
  const finalCommandArgs = {};
  Object.keys(argDefs).forEach((key) => {
    const argDef = argDefs[key];
    finalCommandArgs[key] = argDef.parse(args[key]);
  });
  rc.args = finalCommandArgs;

  // run
  const startTime = process.hrtime();

  const mf = new MakfyInstance(rc);
  try {
    commands[commandName].run(mf.exec, rc.args);
  }
  catch (err) {
    if (!(err instanceof RunError) && !(err instanceof MakfyError)) {
      // an error most probably thrown by the execution of run
      throw new MakfyError(err.message);
    }
    else {
      throw err;
    }
  }

  const endTime = process.hrtime(startTime);
  if (!internal) {
    console.log('\n' + getTimeString() + chalk.bgGreen.bold.white(`'${commandName}' done in ${prettyHrTime(endTime)}`));
  }
  resetColors();
};

export const listCommand = (commands: Commands, commandName: string, listArguments = true) => {
  if (!commandName) {
    throw new MakfyError('missing command name');
  }

  const w = new TextWriter();

  // this also makes sure the command exists
  const parsedCommands = parseCommands(commands, false);
  const parsedCommand = parsedCommands[commandName];
  if (!parsedCommand) {
    throw new MakfyError(`command '${commandName}' not found`);
  }

  const command = commands[commandName];

  let title = chalk.bgBlue.bold.white(commandName);

  const aw = new TextWriter();
  if (listArguments) {
    const argDefsList: [string, ParsedArgDefinition][] = entries(parsedCommand.argDefinitions);
    // sort alphabetically
    argDefsList.sort((a, b) => {
      return a[0].toLowerCase().localeCompare(b[0].toLowerCase());
    });

    if (argDefsList.length > 0) {
      const requiredArgs = argDefsList.filter((e) => e[1].required);
      const optionalArgs = argDefsList.filter((e) => !e[1].required);

      const formatLeftHelp = (argDef: ParsedArgDefinition) => {
        const {required, leftHelp} = argDef;
        const leftBracket = required ? '' : '[';
        const rightBracket = required ? '' : ']';

        return chalk.dim.gray(` ${leftBracket}${leftHelp}${rightBracket}`);
      };

      // find left help side max length
      const lengths = argDefsList.map((entry) => chalk.stripColor(formatLeftHelp(entry[1])).length);
      const maxLeftLength = Math.max(...lengths) + 4;

      const writeArgHelp = (argDef: [string, ParsedArgDefinition]) => {
        const {rightHelp} = argDef[1];

        const formattedLeftHelp = formatLeftHelp(argDef[1]);
        let help = formattedLeftHelp;

        if (rightHelp) {
          for (let i = chalk.stripColor(formattedLeftHelp).length; i < maxLeftLength; i++) {
            help += ' ';
          }
          help += rightHelp;
        }
        aw.writeLine(`  ${help}`);

        title += formattedLeftHelp;
      };

      if (requiredArgs.length > 0) {
        requiredArgs.forEach((e) => {
          writeArgHelp(e);
        });
      }

      if (optionalArgs.length > 0) {
        optionalArgs.forEach((e) => {
          writeArgHelp(e);
        });
      }

    }
  }

  w.writeLine(title);
  if (command.desc !== undefined) {
    w.writeLine(chalk.dim.gray(` - ${command.desc}`));
  }
  w.write(aw.output);
  w.writeLine(chalk.reset(''));

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
      output += listCommand(commands, commandName, listArguments);
    }
  }

  return output;
};
