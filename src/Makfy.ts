import * as path from 'path';
import * as colors from 'colors/safe';
import * as child_process from 'child_process';
import { resetColors, getTimeString } from './utils';
import { ExecError, MakfyError } from './errors';
import { Options } from './options';
import { Command } from './commandParser';

const pathEnvName = process.platform === 'win32' ? 'Path' : 'path';

export type ExecCommand = string | (() => any) | Command;

export class Makfy {
  private readonly options: Options;
  private readonly args: object;

  constructor(options: Options, args: object) {
    this.options = options;
    this.args = args || {};
  }

  exec = (...commands: ExecCommand[]) => {
    for (const command of commands) {
      if (command === null || command === undefined) {
        // skip
      }
      else if (typeof command === 'function') {
        this._execFunction(command);
      }
      else if (typeof command === 'object') {
        this._execObject(command);
      }
      else if (typeof command === 'string') {
        if (command.startsWith('?')) {
          this._execHelpString(command);
        }
        else {
          this._execCommandString(command);
        }
      }
    }
  }

  private _execFunction = (command: () => any) => {
    command();
  }

  private _execObject = (command: Command) => {
    if (command.run) {
      command.run(this.exec, this.args);
    }
    else {
      throw new MakfyError('Command inside exec was an object but had no run method');
    }
  }

  private _execHelpString = (command: string) => {
    console.log('\n' + getTimeString() + colors.bgCyan(colors.bold(colors.white(`${command.substr(1).trim()}`))));
  }

  private _execCommandString = (command: string) => {
    // add node_modules/.bin to path
    const env = Object.assign({}, process.env, {
      [pathEnvName]: `${path.resolve(path.join('node_modules/.bin'))}${path.delimiter}${process.env[pathEnvName] || ''}`
    });

    const startTime = Date.now();

    let silentLevel = 0;
    if (command.startsWith('%%')) {
      silentLevel = 2;
      command = command.substr(2).trim();
    }
    else if (command.startsWith('%')) {
      silentLevel = 1;
      command = command.substr(1).trim();
    }

    if (silentLevel <= 1) {
      console.log(getTimeString() + colors.blue(`> ${command}`));
    }

    const printProfileTime = () => {
      if (this.options.profiling && silentLevel < 2) {
        const time = Date.now() - startTime;
        process.stdout.write(getTimeString() + colors.cyan(`finished in ${time} ms`) + colors.blue(` > ${command}\n`));
      }
    };

    try {
      child_process.execSync(command, {
        env: env,
        stdio: [process.stdin, silentLevel === 0 ? process.stdout : 'pipe', process.stderr]
      });
      printProfileTime();
      resetColors();
    }
    catch (result) {
      printProfileTime();
      const code = result.status;

      const err1 = `Failed with code ${code}`;
      const err2 = `> ${command}`;
      process.stderr.write(getTimeString() + colors.bgRed(colors.bold(colors.white(err1))) + colors.blue(` ${err2}\n`));
      throw new ExecError(`${err1} ${err2}`);
    }
  }
}
