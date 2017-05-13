#! /usr/bin/env node

import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as yargs from 'yargs';
import { listAllCommands, listCommand, runCommandAsync } from '../lib/';
import { MakfyError, RunError } from '../lib/errors';
import { alphanumericPattern } from '../lib/schema';
import { reservedArgNames } from '../lib/schema/args';
import { errorMessageForObject, formatContextId, isObject, resetColors } from '../lib/utils';

const entries = require('object.entries');

const programName = 'makfy';
const argv = yargs.argv;

const enum ErrCode {
  CliError = 1,
  UserFileError = 2,
  ExecError = 3
}

const exitWithError = (code: ErrCode, message?: string, prefix?: string) => {
  resetColors();
  if (message) {
    console.error((prefix ? prefix : '') + chalk.dim.red('[ERROR] ' + message));
  }
  process.exit(code);
};

const defaultFilename = programName + 'file.js';
// TODO: read from package json?
const version = '0.0.1';

const printProgramHelp = () => {
  // TODO: colorize this
  console.log(`${programName} v${version}`);
  console.log();
  console.log(`usage:`);
  console.log(` - run command:          ${programName} [-f ${defaultFilename}] <command> [--profile] ...commandOptions`);
  console.log(` - list all commands:    ${programName} [-f ${defaultFilename}] --list`);
  console.log(` - list command:         ${programName} [-f ${defaultFilename}] <command> --list`);
  console.log(` - show help (this):     ${programName} [--help]`);
  console.log(` [--profile]             force show the time it takes to run each subcommand`);
  console.log(` [--show-time]           force show the current time`);
  console.log(` [--color/--no-color]    force colored/uncolored output (default: autodetect)`);
};

interface FileToLoad {
  filename: string;
  absoluteFilename: string;
}

const getFileToLoad = (): FileToLoad => {
  let filename = defaultFilename;
  if (argv.f || argv.file) {
    if (argv.f && argv.file) {
      exitWithError(ErrCode.CliError, `-f and --file cannot be used at the same time`);
    }
    filename = argv.f || argv.file;
  }
  if (!fs.existsSync(filename)) {
    exitWithError(ErrCode.CliError, `command file '${filename}' not found`);
  }

  console.log(chalk.dim.gray(`using command file '${chalk.dim.magenta(filename)}'...`));

  const absoluteFilename = path.resolve(filename);

  return {
    filename,
    absoluteFilename
  };
};

const loadFile = (fileToLoad: FileToLoad) => {
  const {filename, absoluteFilename} = fileToLoad;

  // try to load the user file
  try {
    const fileExports = require(absoluteFilename);

    if (!isObject(fileExports)) {
      exitWithError(ErrCode.UserFileError, `module.exports inside '${filename}' is not an object`);
    }

    return fileExports;
  }
  catch (err) {
    exitWithError(ErrCode.UserFileError, `error requiring ${filename}:\n${err.stack.toString()}`);
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

  if (argv.list || argv.l) {
    // list
    const fileToLoad = getFileToLoad();
    const fileExports = loadFile(fileToLoad);

    const commandName = argv._.length > 0 ? argv._[0].trim() : undefined;
    if (commandName) {
      if (argv._.length > 1) {
        exitWithError(ErrCode.CliError, `specify only one command to list or don't specify any commands to list them all`);
        return;
      }

      execute = async () => {
        const output = chalk.dim.gray(`listing '${commandName}' command...\n\n`) + listCommand(fileExports.commands, commandName, true);
        console.log(output);
      };
    }
    else {
      execute = async () => {
        const output = chalk.dim.gray('listing all commands...\n\n') + listAllCommands(fileExports.commands, true);
        console.log(output);
      };
    }
  }
  else {
    // run
    if (argv._.length <= 0) {
      printProgramHelp();
      exitWithError(ErrCode.CliError);
      return;
    }

    if (argv._.length > 1) {
      exitWithError(ErrCode.CliError, 'only one command can be run at the same time');
      return;
    }

    const fileToLoad = getFileToLoad();
    const fileExports = loadFile(fileToLoad);

    const commandName = argv._[0].trim();

    // remove reserved args
    const commandArgs = Object.assign({}, argv);
    delete commandArgs._;
    delete commandArgs.$0;

    for (const resArg of reservedArgNames) {
      delete commandArgs[resArg];
    }

    // remove non alphanumeric args (because yargs transforms fooBar into foo-bar and fooBar)
    for (const argName of Object.keys(argv)) {
      if (!new RegExp(alphanumericPattern).test(argName)) {
        delete commandArgs[argName];
      }
    }

    let options = fileExports.options;
    if (options === undefined) {
      options = {};
    }
    if (!isObject(options)) {
      exitWithError(ErrCode.UserFileError, errorMessageForObject(['options'], `must be an object or undefined`));
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
        commands: fileExports.commands,
        commandName: commandName,
        commandArgs: commandArgs,
        options: options
      });
    };
  }

  try {
    await execute();
  }
  catch (err) {
    resetColors();
    if (err instanceof MakfyError) {
      const prefix = (err.execContext ? formatContextId(err.execContext) : undefined);
      exitWithError(ErrCode.UserFileError, err.message, prefix);
    }
    else if (err instanceof RunError) {
      // the message should be printed already
      exitWithError(ErrCode.ExecError);
    }
    else {
      throw err;
    }
  }
  finally {
    resetColors();
  }
};

try {
  //noinspection JSIgnoredPromiseFromCall
  mainAsync();
}
catch (err) {
  throw err;
}
