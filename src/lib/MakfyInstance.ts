import * as chalk from 'chalk';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import { MakfyError, RunError } from './errors';
import { Options } from './options';
import { OutputBuffer } from './OutputBuffer';
import { ExecCommand, ExecFunction } from './schema/runtime';
import * as shellescape from './shellescape';
import { getTimeString, objectToCommandLineArgs, resetColors } from './utils';
import Socket = NodeJS.Socket;
import Timer = NodeJS.Timer;

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

interface ExecContext {
  id: string;
  color: string;
  cwd?: string;
}

const formatContextId = (context: ExecContext) => {
  return chalk.dim[context.color](context.id + '/ ');
};

const contextIdColors = [
  'magenta',
  'blue',
  'green',
  'yellow',
];

export class MakfyInstance {
  private static _lastId = 0;

  private readonly _runContext: RunContext;

  constructor(runContext: RunContext) {
    this._runContext = runContext;
  }

  exec: ExecFunction = async (...cmds: ExecCommand[]) => {
    const id = MakfyInstance._lastId;
    MakfyInstance._lastId++;
    const context: ExecContext = {
      id: String(id),
      color: contextIdColors[id % contextIdColors.length],
      cwd: undefined
    };

    const innerExec = async (...commands: ExecCommand[]) => {
      for (let command of commands) {
        if (command === null || command === undefined) {
          // skip
        }
        else if (typeof command === 'string') {
          command = command.trim();
          if (command === '') {
            // skip
          }
          else if (command.startsWith('?')) {
            this._execHelpString(command, context);
          }
          else if (command.startsWith('@')) {
            await this._execSubCommand(command, context);
          }
          else {
            await this._execCommandString(command, false, context);
          }
        }
      }

      return {
        keepContext: innerExec
      };
    };

    return await innerExec(...cmds);
  }

  private _execSubCommandAsCommandLine = (command: string) => {
    const runContext = this._runContext;

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

    return fullCommand;
  }

  private _execSubCommand = async (command: string, context: ExecContext) => {
    await this._execCommandString(this._execSubCommandAsCommandLine(command), true, context);
  }

  private _execHelpString = (command: string, context: ExecContext) => {
    console.log('\n' + formatContextId(context) + getTimeString() + chalk.bgCyan.bold.white(`${command.substr(1).trim()}`));
  }

  private _execCommandString = async (command: string, internal: boolean, context: ExecContext) => {
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
        console.log(formatContextId(context) + getTimeString() + chalk.dim.blue(`> ${command}`));
      }
    }

    const printProfileTime = () => {
      if (!internal && this._runContext.options.profile && silentLevel < 2) {
        const endTime = process.hrtime(startTime);
        process.stdout.write(formatContextId(context) + getTimeString() + chalk.dim.gray(`finished in ${chalk.dim.magenta(prettyHrTime(endTime))}`) + chalk.dim.blue(` > ${command}\n`));
      }
    };

    // get a tmp file to save the current working dir
    const tmpFilename = tmp.tmpNameSync({prefix: 'makfy-'});
    const cleanup = () => {
      //noinspection EmptyCatchBlockJS
      try {
        fs.unlinkSync(tmpFilename);
      }
      catch (err) {
        // do nothing
      }
      resetColors();
    };

    const showAndGetError = (code: number | null, signal: string | null) => {
      let err1;
      if (code !== null) {
        err1 = `failed with code ${code}`;
      }
      else {
        err1 = `killed by signal ${signal}`;
      }

      const err2 = `> ${command}`;
      if (!internal) {
        process.stderr.write(formatContextId(context) + getTimeString() + chalk.bgRed.bold.white(err1) + chalk.blue(` ${err2}\n`));
      }
      return new RunError(`${err1} ${err2}`);
    };

    resetColors();

    const cwdName = getCwdName();
    let finalCommand = `${command} && ${cwdName} > ${escapeForShell(tmpFilename)}`;
    if (context.cwd) {
      finalCommand = `${getChdirName()} ${escapeForShell(context.cwd)} && ${finalCommand}`;
    }

    return new Promise((resolve, reject) => {
      const childProc = child_process.spawn(finalCommand, [], {
        env: env,
        shell: process.env.SHELL !== undefined ? process.env.SHELL : true,
        stdio: [process.stdin, silentLevel === 0 ? 'pipe' : 'ignore', 'pipe']
      });

      let exitDone = false;

      childProc.on('error', (err) => {
        if (exitDone) return;
        exitDone = true;

        cleanup();
        reject(new MakfyError(`shell could not be spawned - ${err.message}`));
      });

      const outputBuffer = new OutputBuffer(formatContextId(context), {
        out: {
          socket: process.stdout,
          color: 'gray'
        },
        err: {
          socket: process.stderr,
          color: 'magenta'
        }
      });

      // flush output every second
      let flushInterval: Timer | undefined = setInterval(() => {
        outputBuffer.flush();
      }, 1000);

      const finish = (error?: Error) => {
        if (flushInterval) {
          clearInterval(flushInterval);
          flushInterval = undefined;
        }
        outputBuffer.flush();
        console.log();
        cleanup();
        printProfileTime();

        if (error) reject(error);
        resolve();
      };

      childProc.on('close', (code, signal) => {
        if (exitDone) return;
        exitDone = true;

        if (code !== null) {
          if (code === 0) {
            // standard exit

            // read the temp file with the new cwd
            context.cwd = fs.readFileSync(tmpFilename, 'utf-8').replace(/\r?\n|\r/g, '').trim();

            finish();
          }
          else {
            finish(showAndGetError(code, signal));
          }
        }
        else {
          // killed
          finish(showAndGetError(code, signal));
        }
      });

      if (childProc.stdout) {
        childProc.stdout.on('data', (data: Buffer) => {
          outputBuffer.write({
            type: 'out',
            data: data
          });
        });
      }

      if (childProc.stderr) {
        childProc.stderr.on('data', (data: Buffer) => {
          outputBuffer.write({
            type: 'err',
            data: data
          });
        });
      }

    });

  }
}
