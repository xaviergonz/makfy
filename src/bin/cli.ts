#! /usr/bin/env node

import * as chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as yargs from 'yargs';
import { listAllCommands, listCommand, runCommand } from '../lib/';
import { ExecError, MakfyError } from '../lib/errors';
import { reservedArgNames } from '../lib/schema/args';

import { errorMessageForObject, isObject, resetColors } from '../lib/utils';

const programName = 'makfy';
const argv = yargs.argv;

const enum ErrCode {
  CliError = -3,
  UserFileError = -2,
  ExecError = -1
}

const exitWithError = (code: ErrCode, message?: string) => {
  resetColors();
  if (message) {
    console.error(chalk.dim.red('[ERROR] ' + message));
  }
  process.exit(code);
};

const defaultFilename = programName + 'file.js';
// TODO: read from package json?
const version = '0.0.1';

const printProgramHelp = () => {
  console.log(`${programName} v${version}`);
  console.log();
  console.log(`usage:`);
  console.log(` - run command:          ${programName} [-f ${defaultFilename}] <command> ...commandOptions`);
  console.log(` - list all commands:    ${programName} [-f ${defaultFilename}] --list`);
  console.log(` - list command:         ${programName} [-f ${defaultFilename}] <command> --list`);
  console.log(` - show help (this):     ${programName} [--help]`);
};

const loadFile = () => {
  let filename = defaultFilename;
  if (argv.f) {
    filename = argv.f;
  }
  if (!fs.existsSync(filename)) {
    exitWithError(ErrCode.CliError, `command file '${filename}' not found`);
  }

  console.log(chalk.dim.gray(`using command file '${chalk.dim.magenta(filename)}'...`));

  // try to load the user file
  const absoluteFilename = path.resolve(filename);
  try {
    const fileExports = require(absoluteFilename);

    if (!isObject(fileExports)) {
      exitWithError(ErrCode.UserFileError, `module.exports inside '${filename}' is not an object`);
    }

    return fileExports;
  }
  catch (err) {
    exitWithError(ErrCode.UserFileError, `error requiring ${filename}:\n${err.message}`);
  }
};

const main = () => {
  resetColors();

  if (argv.help || argv.h) {
    printProgramHelp();
    exitWithError(ErrCode.CliError);
    return;
  }

  let execute;

  if (argv.list || argv.l) {
    // list
    const fileExports = loadFile();

    const commandName = argv._.length > 0 ? argv._[0].trim() : undefined;
    if (commandName) {
      if (argv._.length > 1) {
        exitWithError(ErrCode.CliError, `specify only one command to list or don't specify any commands to list them all`);
        return;
      }

      execute = () => {
        const output = chalk.dim.gray(`listing '${commandName}' command...\n\n`) + listCommand(fileExports.commands, commandName, true);
        console.log(output);
      };
    }
    else {
      execute = () => {
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

    const fileExports = loadFile();

    const commandName = argv._[0].trim();

    // remove reserved args
    const commandArgs = Object.assign({}, argv);
    delete commandArgs._;
    delete commandArgs.$0;
    for (const resArg of reservedArgNames) {
      delete commandArgs[resArg];
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

    execute = () => {
      runCommand(fileExports.commands, commandName, commandArgs, options);
    };
  }

  try {
    execute();
  }
  catch (err) {
    resetColors();
    if (err instanceof MakfyError) {
      exitWithError(ErrCode.UserFileError, err.message);
    }
    else if (err instanceof ExecError) {
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

main();
