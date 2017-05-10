import * as path from 'path';
import * as fs from 'fs';
import * as colors from 'colors/safe';

import { resetColors } from './utils';
import { MakfyError, ExecError } from './errors';
import { runCommand, listAllCommands, listCommand } from './index';
import { isObject } from './utils';
import { reservedArgs } from './argDefinitonParser';

const programName = 'makfy';
const argv = require('yargs').argv;

const errCodes = {
  cliError: -3,
  userFileError: -2,
  execError: -1
};

const exitWithError = (code: number, message?: string) => {
  resetColors();
  if (message) {
    console.error(colors.red('[ERROR] ' + message));
  }
  process.exit(code);
};

const defaultFilename = programName + 'file.js';
// TODO: read from package json?
const version = '0.0.1';

const printProgramHelp = () => {
  console.log(`${programName} v${version}`);
  console.log();
  console.log(`Usage:`);
  console.log(` - run command:       ${programName} [-f ${defaultFilename}] <command> ...commandOptions`);
  console.log(` - list all commands: ${programName} [-f ${defaultFilename}] --list`);
  console.log(` - list command:      ${programName} [-f ${defaultFilename}] <command> --list`);
  console.log(` - show help (this):  ${programName} [--help]`);
};

const loadFile = () => {
  let filename = defaultFilename;
  if (argv.f) {
    filename = argv.f;
  }
  if (!fs.existsSync(filename)) {
    exitWithError(errCodes.cliError, `Command file '${filename}' not found`);
  }

  console.log(colors.gray(`Using command file '${filename}'...`));

  // try to load the user file
  const absoluteFilename = path.resolve(filename);
  try {
    const fileExports = require(absoluteFilename);

    if (!isObject(fileExports)) {
      exitWithError(errCodes.userFileError, `module.exports inside '${filename}' is not an object`);
    }

    return fileExports;
  }
  catch (err) {
    exitWithError(errCodes.userFileError, `Error requiring ${filename}:\n${err.message}`);
  }
};

const main = () => {
  if (argv.help || argv.h) {
    printProgramHelp();
    exitWithError(errCodes.cliError);
    return;
  }

  let execute;

  if (argv.list || argv.l) {
    // list
    const fileExports = loadFile();

    const commandName = argv._.length > 0 ? argv._[0].trim() : undefined;
    if (commandName) {
      if (argv._.length > 1) {
        exitWithError(errCodes.cliError, `Specify only one command to list or don't specify any commands to list them all`);
        return;
      }

      execute = () => {
        const output = colors.gray(`Listing '${commandName}' command...\n\n`) + listCommand(fileExports.commands, commandName, true);
        console.log(output);
      };
    }
    else {
      execute = () => {
        const output = colors.gray('Listing all commands...\n\n') + listAllCommands(fileExports.commands, true);
        console.log(output);
      };
    }
  }
  else {
    // run
    if (argv._.length <= 0) {
      printProgramHelp();
      exitWithError(errCodes.cliError);
      return;
    }

    if (argv._.length > 1) {
      exitWithError(errCodes.cliError, 'Only one command can be run at once');
      return;
    }

    const fileExports = loadFile();

    const commandName = argv._[0].trim();

    // remove reserved args
    const commandArgs = Object.assign({}, argv);
    delete commandArgs._;
    delete commandArgs.$0;
    for (const resArg of reservedArgs) {
      delete commandArgs[resArg];
    }

    execute = () => {
      runCommand(fileExports.commands, commandName, commandArgs, fileExports.options);
    };
  }

  try {
    execute();
  }
  catch (err) {
    resetColors();
    if (err instanceof MakfyError) {
      exitWithError(errCodes.userFileError, err.message);
    }
    else if (err instanceof ExecError) {
      // the message should be printed already
      exitWithError(errCodes.execError);
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
