#! /usr/bin/env node

import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import * as tsNode from "ts-node";
import * as yargs from "yargs";
import { listAllCommands, listCommand, MakfyConfig, runCommandAsync } from "../lib/";
import { MakfyError, RunError } from "../lib/errors";
import { alphanumericExtendedPattern } from "../lib/schema";
import { reservedArgNames } from "../lib/schema/args";
import { Commands } from "../lib/schema/commands";
import { PartialOptions } from "../lib/schema/options";
import { resetColors } from "../lib/utils/console";
import { errorMessageForObject, formatContextId } from "../lib/utils/formatting";
import { isObject, isStringArray } from "../lib/utils/typeChecking";
import stripColor = require("strip-ansi");

// enable ts support
tsNode.register({
  pretty: true
});

const programName = "makfy";
const argv = yargs.help(false).argv;

const enum ErrCode {
  CliError = 1,
  UserFileError = 2,
  ExecError = 3
}

const exitWithError = (code: ErrCode, message?: string, prefix?: string): never => {
  resetColors();
  if (message) {
    console.error((prefix ? prefix : "") + chalk.bold.red("[ERROR] " + message));
  }
  process.exit(code);

  // this should never happen
  throw new Error();
};

const defaultFilename = programName + "file";
const version = require("../../package.json").version;

const printProgramHelp = () => {
  console.log(`${programName} v${version}`);
  console.log();
  console.log(`usage:`);

  const pad = (str: string) => {
    str = " " + str;
    for (let i = stripColor(str).length; i < 34; i++) {
      str += " ";
    }
    return str;
  };

  const logHelp1 = (what: string, how: string, showFile: boolean) => {
    const left = pad(chalk.bold.green(` - ${what}`));
    const right = chalk.bold.gray(
      `${programName} ${
        showFile ? chalk.bold.magenta(`[-f ${defaultFilename}] `) : ""
      }${chalk.bold.magenta(how)}`
    );
    console.log(left + right);
  };

  logHelp1("run command:", `<command> ...commandOptions`, true);
  logHelp1("list all commands:", `--list`, true);
  logHelp1("list command:", ` <command> --list`, true);
  logHelp1("show help (this):", `[--help]`, false);

  const logArgHelp = (argName: string, desc: string) => {
    const left = pad(" " + chalk.bold.gray(`[${chalk.bold.magenta(argName)}]`));
    console.log(left + chalk.bold.gray(desc));
  };

  logArgHelp("--profile", "force show the time it takes to run each subcommand");
  logArgHelp("--show-time", "force show the current time");
  logArgHelp("--color/--no-color", "force colored/uncolored output (default: autodetect)");
};

interface FileToLoad {
  filename: string;
  absoluteFilename: string;
}

const getFileToLoad = (): FileToLoad => {
  let mainFilename = defaultFilename;
  if (argv.f || argv.file) {
    if (argv.f && argv.file) {
      exitWithError(ErrCode.CliError, `-f and --file cannot be used at the same time`);
    }
    mainFilename = argv.f || argv.file;
  }

  const filesToTry: string[] = [mainFilename];
  if (path.extname(mainFilename) === "") {
    filesToTry.push(mainFilename + ".ts");
    filesToTry.push(mainFilename + ".js");
  }

  for (const filename of filesToTry) {
    if (fs.existsSync(filename)) {
      console.log(chalk.bold.gray(`using command file '${chalk.bold.magenta(filename)}'...`));

      const absoluteFilename = path.resolve(filename);

      return {
        filename,
        absoluteFilename
      };
    }
  }

  exitWithError(ErrCode.CliError, `command file not found, tried ${filesToTry.join(", ")}`);
  // this should never happen
  throw new Error();
};

interface LoadFileResult {
  exports: {
    commands: Commands;
    options?: PartialOptions;
  };
  contents?: string;
}

const loadFile = (fileToLoad: FileToLoad, loadContents: boolean): LoadFileResult | undefined => {
  const { filename, absoluteFilename } = fileToLoad;

  // try to load the user file
  try {
    let usingDefaultExport = false;
    let fileExports: MakfyConfig = require(absoluteFilename);

    // use default export if available
    if ((fileExports as any).default) {
      usingDefaultExport = true;
      fileExports = (fileExports as any).default;
    }

    if (!isObject(fileExports)) {
      exitWithError(
        ErrCode.UserFileError,
        `module.exports${
          usingDefaultExport ? ".default" : ""
        } inside '${filename}' is not an object`
      );
      return;
    }

    let contents;
    if (loadContents) {
      contents = fs.readFileSync(absoluteFilename, "utf8");
      const deps = fileExports.dependencies;
      if (deps) {
        if (!isStringArray(deps)) {
          exitWithError(
            ErrCode.UserFileError,
            `export dependencies must be a string array with paths to files`
          );
        }

        const rootDir = path.dirname(absoluteFilename);
        for (const dep of deps) {
          let absDepFilename;
          if (path.isAbsolute(dep)) {
            absDepFilename = dep;
          } else {
            absDepFilename = path.join(rootDir, dep);
          }

          if (!fs.existsSync(absDepFilename) && !absDepFilename.toLowerCase().endsWith(".js")) {
            absDepFilename += ".js";
          }

          contents += fs.readFileSync(absDepFilename, "utf8");
        }
      }
    }

    return {
      exports: fileExports,
      contents: contents
    };
  } catch (err) {
    exitWithError(ErrCode.UserFileError, `error requiring ${filename}:\n${err.stack.toString()}`);
    return;
  }
};

const mainAsync = async () => {
  resetColors();

  if (argv.help || argv.h) {
    printProgramHelp();
    exitWithError(ErrCode.CliError);
    return;
  }

  let execute: () => Promise<void>;

  if (argv.list || argv.l || argv._.length <= 0) {
    // list
    const fileToLoad = getFileToLoad();
    const { exports } = loadFile(fileToLoad, false)!;

    const commandName = argv._.length > 0 ? argv._[0].trim() : undefined;
    if (commandName) {
      if (argv._.length > 1) {
        exitWithError(
          ErrCode.CliError,
          `specify only one command to list or don't specify any commands to list them all`
        );
        return;
      }

      execute = async () => {
        const output =
          chalk.bold.gray(`listing '${commandName}' command...\n\n`) +
          listCommand(exports.commands, commandName, true);
        console.log(output);
      };
    } else {
      execute = async () => {
        const output =
          chalk.bold.gray("listing all commands...\n\n") + listAllCommands(exports.commands, true);
        console.log(output);
      };
    }
  } else {
    // run
    if (argv._.length > 1) {
      exitWithError(ErrCode.CliError, "only one command can be run at the same time");
      return;
    }

    const fileToLoad = getFileToLoad();
    const { exports, contents } = loadFile(fileToLoad, true)!;

    const commandName = argv._[0].trim();

    // remove reserved args
    const commandArgs = { ...argv };
    delete commandArgs._;
    delete commandArgs.$0;

    for (const resArg of reservedArgNames) {
      delete commandArgs[resArg];
    }

    // remove non alphanumeric extended args
    for (const argName of Object.keys(argv)) {
      if (!new RegExp(alphanumericExtendedPattern).test(argName)) {
        delete commandArgs[argName];
      }
    }

    let options = exports.options;
    if (options === undefined) {
      options = {};
    }
    if (!isObject(options)) {
      exitWithError(
        ErrCode.UserFileError,
        errorMessageForObject(["options"], `must be an object or undefined`)
      );
      return;
    }
    if (argv.profile) {
      options.profile = true;
    }
    if (argv.showTime) {
      options.showTime = true;
    }

    execute = async () => {
      await runCommandAsync({
        makfyFilename: fileToLoad.filename,
        makfyFileContents: contents,
        commands: exports.commands,
        commandName: commandName,
        commandArgs: commandArgs,
        options: options
      });
    };
  }

  try {
    await execute();
  } catch (err) {
    resetColors();
    if (err instanceof MakfyError) {
      const prefix = err.execContext ? formatContextId(err.execContext) : undefined;
      exitWithError(ErrCode.UserFileError, err.message, prefix);
    } else if (err instanceof RunError) {
      // the message should be printed already
      exitWithError(ErrCode.ExecError);
    } else {
      throw err;
    }
  } finally {
    resetColors();
  }
};

try {
  //noinspection JSIgnoredPromiseFromCall
  mainAsync();
} catch (err) {
  throw err;
}
