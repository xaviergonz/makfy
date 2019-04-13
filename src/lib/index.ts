import chalk, { Level } from "chalk";
import stripColor from "strip-ansi";
import { MakfyError, RunError } from "./errors";
import * as execRuntime from "./execRuntime";
import { ParsedArgDefinition } from "./parser/commandArg";
import { parseCommands } from "./parser/commands";
import { parseOptions } from "./parser/options";
import { command, Command, CommandFromFunction, Commands } from "./schema/commands";
import { FullOptions, PartialOptions } from "./schema/options";
import { ExecCommand, ExecFunction } from "./schema/runtime";
import { resetColors } from "./utils/console";
import { errorMessageForObject, getTimeString } from "./utils/formatting";
import { saveHashCollectionFileAsync } from "./utils/hash";
import { TextWriter } from "./utils/TextWriter";
import { isObject } from "./utils/typeChecking";

const prettyHrTime = require("pretty-hrtime");
type ExecContext = execRuntime.ExecContext;

export { command };

export interface MakfyConfig {
  commands: Commands;
  dependencies?: string[];
  options?: PartialOptions;
}

// only used for TS typing
export function makfyConfig(makfyConfigData: MakfyConfig): MakfyConfig {
  return makfyConfigData;
}

export interface RunCommandOptions {
  commands: Commands;
  commandName: string;
  commandArgs: object | undefined;
  makfyFilename: string;
  makfyFileContents?: string;
  options: PartialOptions | undefined;
}

export const runCommandAsync = async (runCommandOptions: RunCommandOptions) => {
  const {
    commands,
    commandName,
    commandArgs,
    options,
    makfyFilename,
    makfyFileContents
  } = runCommandOptions;

  if (!commandName) {
    throw new MakfyError("command name missing", undefined);
  }

  const parsedOptions: FullOptions = parseOptions(options, false);

  const parsedCommands = parseCommands(commands, false);
  const currentCommand = commands[commandName];
  const parsedCommand = parsedCommands[commandName];
  if (!parsedCommand || !currentCommand) {
    throw new MakfyError(`command '${commandName}' not found`, undefined);
  }

  if (currentCommand.internal) {
    throw new MakfyError("internal commands cannot be run directly", undefined);
  }

  console.log(
    getTimeString(parsedOptions.showTime) + chalk.bgBlue.bold.white(`${commandName} - running...`)
  );

  // run
  const startTime = process.hrtime();

  const getFileChangesResults: ExecContext["getFileChangesResults"] = {};

  const execContext: ExecContext = {
    // for MakfyContext
    commandName: commandName,
    commandArgs: commandArgs || {},
    commands: commands,
    options: {
      ...parsedOptions,
      colorMode: chalk.supportsColor.level !== Level.None
    },
    makfyFilename: makfyFilename,

    // for ExecContext
    parsedCommands: parsedCommands,
    makfyFileContents: makfyFileContents,
    syncMode: true,
    idStack: [],
    getFileChangesResults: getFileChangesResults
  };

  try {
    await execRuntime.runCommandAsync(commandName, commandArgs || {}, execContext, false);

    // on success save new caches in parallel
    const savePromises = [];
    for (const [key, value] of Object.entries(getFileChangesResults)) {
      savePromises.push(saveHashCollectionFileAsync(key, value.newHashCollection));
    }
    await Promise.all(savePromises);
  } catch (err) {
    if (!(err instanceof RunError) && !(err instanceof MakfyError)) {
      // an error most probably thrown by the execution of run
      throw new MakfyError(err.message, undefined);
    } else {
      throw err;
    }
  }

  const endTime = process.hrtime(startTime);
  console.log(
    "\n" +
      getTimeString(parsedOptions.showTime) +
      chalk.bold.green(`'${commandName}' done in ${prettyHrTime(endTime)}`)
  );
  resetColors();
};

export const listCommand = (commands: Commands, commandName: string, listArguments = true) => {
  if (!commandName) {
    throw new MakfyError("missing command name", undefined);
  }

  const w = new TextWriter();

  // this also makes sure the command exists
  const parsedCommands = parseCommands(commands, false);
  const parsedCommand = parsedCommands[commandName];
  if (!parsedCommand) {
    throw new MakfyError(`command '${commandName}' not found`, undefined);
  }

  const currentCommand = commands[commandName];

  let title = chalk.bgBlue.bold.white(commandName);

  const aw = new TextWriter();
  if (listArguments) {
    const argDefsList = Object.entries(parsedCommand.argDefinitions);
    // sort alphabetically
    argDefsList.sort((a, b) => {
      return a[0].toLowerCase().localeCompare(b[0].toLowerCase());
    });

    if (argDefsList.length > 0) {
      const requiredArgs = argDefsList.filter((e) => e[1].required);
      const optionalArgs = argDefsList.filter((e) => !e[1].required);

      const formatLeftHelp = (argDef: ParsedArgDefinition) => {
        const { required, leftHelp } = argDef;
        const leftBracket = required ? "" : "[";
        const rightBracket = required ? "" : "]";

        return chalk.bold.gray(` ${leftBracket}${leftHelp}${rightBracket}`);
      };

      // find left help side max length
      const lengths = argDefsList.map((entry) => stripColor(formatLeftHelp(entry[1])).length);
      const maxLeftLength = Math.max(...lengths) + 4;

      const writeArgHelp = (argDef: [string, ParsedArgDefinition]) => {
        const { rightHelp } = argDef[1];

        const formattedLeftHelp = formatLeftHelp(argDef[1]);
        let help = formattedLeftHelp;

        if (rightHelp) {
          for (let i = stripColor(formattedLeftHelp).length; i < maxLeftLength; i++) {
            help += " ";
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
  if (currentCommand.desc !== undefined) {
    w.writeLine(chalk.bold.gray(` - ${currentCommand.desc}`));
  }
  w.write(aw.output);
  w.writeLine(chalk.reset(""));

  return w.output;
};

export const listAllCommands = (commands: Commands, listArguments = true, listInternal = false) => {
  if (!isObject(commands)) {
    throw new MakfyError(
      errorMessageForObject(["commands"], `must be an object (did you export it?)`),
      undefined
    );
  }

  let output = "";

  for (const commandName of Object.keys(commands)) {
    const currentCommand = commands[commandName];
    if (!currentCommand.internal || listInternal) {
      output += listCommand(commands, commandName, listArguments);
    }
  }
  return output;
};

// short syntax
export function run(...inlineCommands: ExecCommand[]): Command<{}> & CommandFromFunction {
  const cmd: Command<{}> = {
    run: async (exec: ExecFunction) => {
      await exec(...inlineCommands);
    }
  };
  return cmd as Command<{}> & CommandFromFunction;
}
