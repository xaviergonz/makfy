import * as chalk from 'chalk';
import * as child_process from 'child_process';
import * as path from 'path';
import { MakfyError, RunError } from './errors';
import { Options } from './options';
import { ExecCommand, ExecFunction } from './schema/runtime';
import { getTimeString, objectToCommandLineArgs, resetColors } from './utils';

const prettyHrTime = require('pretty-hrtime');
const shellescape = require('any-shell-escape');

const pathEnvName = process.platform === 'win32' ? 'Path' : 'path';

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
    const fullCommand = shellescape([ runContext.cli.nodePath, runContext.cli.jsPath, ...objectToCommandLineArgs(cmdLineObj)]) + cmd.substr(commandName.length);

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

    try {
      resetColors();
      child_process.execSync(command, {
        env: env,
        stdio: [process.stdin, silentLevel === 0 ? process.stdout : 'pipe', process.stderr]
      });
      printProfileTime();
    }
    catch (result) {
      printProfileTime();
      const code = result.status;

      const err1 = `failed with code ${code}`;
      const err2 = `> ${command}`;
      if (!internal) {
        process.stderr.write(getTimeString() + chalk.bgRed.bold.white(err1) + chalk.blue(` ${err2}\n`));
      }
      throw new RunError(`${err1} ${err2}`);
    }
    finally {
      resetColors();
    }
  }
}
