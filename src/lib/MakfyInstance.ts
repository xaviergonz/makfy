import * as chalk from 'chalk';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import { MakfyError, RunError } from './errors';
import { Options } from './options';
import { ExecCommand, ExecFunction } from './schema/runtime';
import * as shellescape from './shellescape';
import { getTimeString, objectToCommandLineArgs, resetColors } from './utils';

const prettyHrTime = require('pretty-hrtime');

const pathEnvName = process.platform === 'win32' ? 'Path' : 'path';
const getShellType = () => (process.env.SHELL ? 'sh' : 'cmd');
const getCwdName = () => (getShellType() === 'sh' ? 'pwd' : 'cd');
const getChdirName = () => (getShellType() === 'sh' ? 'cd' : 'cd /d');
const escapeForShell = (stringOrArray: string | string[]) => shellescape.escapePath(getShellType(), stringOrArray);

export interface RunContext {
  options: Options;
  args: object;
  internal: boolean;
  inheritedArgs: object;
  cli: {
    nodePath: string,
    jsPath: string,
  };
  makfyFileAbsolutePath: string;
}

export class MakfyInstance {
  private readonly runContext: RunContext;
  private cwd: string;

  constructor(runContext: RunContext) {
    this.runContext = runContext;
  }

  exec: ExecFunction = (...commands: ExecCommand[]) => {
    for (const command of commands) {
      if (command === null || command === undefined) {
        // skip
      }
      else if (typeof command === 'function') {
        this._execFunction(command);
      }
      else if (typeof command === 'string') {
        if (command.startsWith('?')) {
          this._execHelpString(command);
        }
        else if (command.startsWith('@')) {
          this._execSubCommand(command);
        }
        else {
          this._execCommandString(command, false);
        }
      }
    }
  }

  private _execFunction = (command: () => any) => {
    command();
  }

  private _execSubCommand = (command: string) => {
    const runContext = this.runContext;

    const cmd = command.substr(1).trim();
    const commandName = cmd.split(' ')[0];
    if (!commandName || commandName.length < 1) {
      throw new MakfyError(`the command name after '@' cannot be empty`);
    }

    const cmdLineObj = {
      internal: true,
      f: runContext.makfyFileAbsolutePath,
      _: [ commandName ],
      ...runContext.inheritedArgs
    };
    let fullCommand = escapeForShell(
      [
        runContext.cli.nodePath,
        runContext.cli.jsPath,
        ...objectToCommandLineArgs(cmdLineObj)
      ]
    );
    fullCommand += cmd.substr(commandName.length);

    this._execCommandString(fullCommand, true);
  }

  private _execHelpString = (command: string) => {
    console.log('\n' + getTimeString() + chalk.bgCyan.bold.white(`${command.substr(1).trim()}`));
  }

  private _execCommandString = (command: string, internal: boolean) => {
    // add node_modules/.bin to path
    const env = Object.assign({}, process.env, {
      [pathEnvName]: `${path.resolve(path.join('node_modules/.bin'))}${path.delimiter}${process.env[pathEnvName] || ''}`
    });

    const startTime = process.hrtime();

    let silentLevel = 0;
    if (!internal) {
      if (command.startsWith('%%')) {
        silentLevel = 2;
        command = command.substr(2).trim();
      }
      else if (command.startsWith('%')) {
        silentLevel = 1;
        command = command.substr(1).trim();
      }

      if (silentLevel <= 1) {
        console.log(getTimeString() + chalk.dim.blue(`> ${command}`));
      }
    }

    const printProfileTime = () => {
      if (!internal && this.runContext.options.profile && silentLevel < 2) {
        const endTime = process.hrtime(startTime);
        process.stdout.write(getTimeString() + chalk.dim.gray(`finished in ${chalk.dim.magenta(prettyHrTime(endTime))}`) + chalk.dim.blue(` > ${command}\n`));
      }
    };

    // create a tmp file to save the current working dir
    const tmpFilename = tmp.tmpNameSync({prefix: 'makfy-'});
    const cwdName = getCwdName();

    try {
      resetColors();

      let finalCommand = `${command} && ${cwdName} > ${escapeForShell(tmpFilename)}`;
      if (this.cwd) {
        finalCommand = `${getChdirName()} ${escapeForShell(this.cwd)} && ${finalCommand}`;
      }

      child_process.execSync(finalCommand, {
        env: env,
        shell: process.env.SHELL,
        stdio: [process.stdin, silentLevel === 0 ? process.stdout : 'pipe', process.stderr]
      });
      printProfileTime();

      // read the temp file with the new cwd
      this.cwd = fs.readFileSync(tmpFilename, 'utf-8').replace(/\r?\n|\r/g, '').trim();
    }
    catch (result) {
      printProfileTime();
      const code = result.status;
      let err1;

      if (code !== undefined) {
        err1 = `failed with code ${code}`;
      }
      else {
        err1 = `failed with error ${result.message}`;
      }

      const err2 = `> ${command}`;
      if (!internal) {
        process.stderr.write(getTimeString() + chalk.bgRed.bold.white(err1) + chalk.blue(` ${err2}\n`));
      }
      throw new RunError(`${err1} ${err2}`);
    }
    finally {
      //noinspection EmptyCatchBlockJS
      try {
        fs.unlinkSync(tmpFilename);
      }
      catch (err) {
        // do nothing
      }
      resetColors();
    }
  }
}
