import * as chalk from 'chalk';
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import { MakfyError, RunError } from './errors';
import { checkHashCollectionMatchesAsync, createCacheFolder, getHashCollectionFilename, loadHashCollectionFileAsync, saveHashCollectionFileAsync } from './hash';
import { OutputBuffer } from './OutputBuffer';
import { ParsedCommand } from './parser/command';
import { ParsedCommands } from './parser/commands';
import { Command, Commands } from './schema/commands';
import { FullOptions } from './schema/options';
import { ExecCommand, ExecFunction, ExecObject, ExecUtils } from './schema/runtime';
import * as shellescape from './shellescape';
import { formatContextId, formatContextIdStack, resetColors, unrollGlobPatternsAsync } from './utils';
import Socket = NodeJS.Socket;
import Timer = NodeJS.Timer;

const prettyHrTime = require('pretty-hrtime');

const getShellType = () => (process.env.SHELL ? 'sh' : 'cmd');
const getPathEnvName = () => (getShellType() === 'sh' ? 'PATH' : 'Path');
const getCwdName = () => (getShellType() === 'sh' ? 'pwd' : 'cd');
const getChdirName = () => (getShellType() === 'sh' ? 'cd' : 'cd /d');
const escapeForShell = (stringOrArray: string | string[]) => shellescape.escapePath(getShellType(), stringOrArray);


export interface ExecContext {
  commands: Commands;
  parsedCommands: ParsedCommands;
  options: FullOptions;
  makfyFilename: string;

  idStack: string[];
  cwd?: string;
  syncMode: boolean;
}

const contextIdColors = [
  'magenta',
  'green',
  'yellow',
  'red',
  'blue',
];

const logWarn = (idStack: string[], showTime: boolean, str: string) => {
  console.error(formatContextIdStack(idStack, showTime) + chalk.bold.red(`[WARN] ${str}`));
};

const logInfo = (idStack: string[], showTime: boolean, str: string) => {
  console.log(formatContextIdStack(idStack, showTime) + chalk.bold.green(`${str}`));
};

export const runCommandAsync = async (commandName: string, commandArgs: object, baseContext: ExecContext, unknownArgMeansError: boolean) => {
  const { commands, parsedCommands } = baseContext;
  const command = commands[commandName];
  const parsedCommand = parsedCommands[commandName];
  const argDefs = parsedCommand.argDefinitions;

  const baseIdStack = [...baseContext.idStack, chalk.bold.blue(commandName)];

  const warn = (msg: string) => {
    logWarn(baseIdStack, baseContext.options.showTime, msg);
  };

  const info = (msg: string) => {
    logInfo(baseIdStack, baseContext.options.showTime, msg);
  };

  // warn for ignored args
  Object.keys(commandArgs).forEach((key) => {
    const argDef = argDefs[key];
    if (!argDef) {
      if (unknownArgMeansError) {
        throw new MakfyError(`argument '${key}' is not defined as a valid argument for command '${commandName}'`, baseContext);
      }
      else {
        warn(`argument '${key}' is not defined as a valid argument for this command and will be ignored`);
      }
    }
  });

  // validate arguments and set default values
  const finalCommandArgs = {};
  Object.keys(argDefs).forEach((key) => {
    const argDef = argDefs[key];
    finalCommandArgs[key] = argDef.parse(commandArgs[key]);
  });

  const execFunc = createExecFunctionContext(baseContext, baseIdStack, true);

  const utils: ExecUtils = {
    filesChanged: async (gobPatterns, logResult = true) => {
      if (typeof gobPatterns === 'string') {
        gobPatterns = [ gobPatterns ];
      }

      gobPatterns = gobPatterns.map((e) => e.trim()).filter((e) => e.length > 0);
      if (gobPatterns.length === 0) {
        return false;
      }

      // unroll glob patterns
      const files = await unrollGlobPatternsAsync(gobPatterns);

      createCacheFolder();
      const hashFilename = getHashCollectionFilename(baseContext.makfyFilename, gobPatterns, 'sha1');

      let oldHashCollection;
      //noinspection EmptyCatchBlockJS
      try {
        oldHashCollection = await loadHashCollectionFileAsync(hashFilename);
      }
      catch (err) {
        // do nothing
      }

      const newHashCollection = await checkHashCollectionMatchesAsync(oldHashCollection, files, 'sha1');
      if (newHashCollection) {
        if (logResult) {
          info(`hash of ${files.length} files did not match`);
        }
        await saveHashCollectionFileAsync(hashFilename, newHashCollection);
        return true;
      }
      else {
        if (logResult) {
          info(`hash of ${files.length} files matched`);
        }
        return false;
      }
    }
  };

  await command.run(execFunc, finalCommandArgs, utils);
};


const createExecFunctionContext = (baseContext: ExecContext, baseIdStack: string[], syncMode: boolean): ExecFunction => {
  let lastId = 0;

  return async (...execCommands: ExecCommand[]) => {
    const id = String(lastId);
    const color = contextIdColors[lastId % contextIdColors.length];
    lastId++;
    const newExecContext = {
      ...baseContext,
      syncMode: syncMode,
      idStack: [...baseIdStack, chalk.bold[color](id)]
    };

    return await (createExecFunction(newExecContext)(...execCommands));
  };
};


const createExecFunction = (context: ExecContext): ExecFunction => {
  const innerExec = async (...commands: ExecCommand[]) => {
    for (let command of commands) {
      if (command === null || command === undefined) {
        // skip
      }
      else if (Array.isArray(command)) {
        await execArray(command, context, innerExec);
      }
      else if (typeof command === 'object') {
        await execObject(command as ExecObject, context);
      }
      else if (typeof command === 'string') {
        command = command.trim();
        if (command === '') {
          // skip
        }
        else if (command.startsWith('@')) {
          await execObject({
            _: command.substr(1).trim()
          }, context);
        }
        else if (command.startsWith('?')) {
          execHelpString(command, context);
        }
        else {
          await execCommandString(command, context);
        }
      }
    }

    return {
      keepContext: innerExec
    };
  };

  return innerExec;
};


const execArray = async (commands: ExecCommand[], baseContext: ExecContext, execFunction: ExecFunction) => {
  if (baseContext.syncMode) {
    // turning into parallel mode
    const baseIdStack = [...baseContext.idStack];
    const execFunc = createExecFunctionContext(baseContext, baseIdStack, false);
    const all = commands.map((cmd) => execFunc(cmd));
    await Promise.all(all);
  }
  else {
    // turning into sync mode
    await execFunction(...commands);
  }
};


const execObject = async (command: ExecObject, context: ExecContext) => {
  const cmdName = command._;
  const args = command.args;
  let cmd: Command;
  let parsedCmd: ParsedCommand;

  if (typeof cmdName === 'string') {
    cmd = context.commands[cmdName];
    parsedCmd = context.parsedCommands[cmdName];
    if (!cmd || !parsedCmd) {
      throw new MakfyError(`'_' property references command '${cmdName}', which is not present`, context);
    }
  }
  else {
    throw new MakfyError(`'_' property must be either a command name or a single command object`, context);
  }

  // cmd now is a command object
  await runCommandAsync(cmdName, args || {}, context, true);
};


const execHelpString = (command: string, context: ExecContext) => {
  console.log('\n' + formatContextId(context) + chalk.bgCyan.bold.white(`${command.substr(1).trim()}`));
};


const execCommandString = async (command: string, context: ExecContext) => {
  // add node_modules/.bin to path
  const pathEnvName = getPathEnvName();
  const env = Object.assign({}, process.env, {
    [pathEnvName]: `${path.resolve(path.join('node_modules/.bin'))}${path.delimiter}${process.env[pathEnvName] || ''}`
  });

  const startTime = process.hrtime();

  let silentLevel = 0;
  if (command.startsWith('%%')) {
    silentLevel = 2;
    command = command.substr(2).trim();
  }
  else if (command.startsWith('%')) {
    silentLevel = 1;
    command = command.substr(1).trim();
  }

  const printProfileTime = (outputBuffer: OutputBuffer) => {
    if (context.options.profile && silentLevel < 2) {
      const endTime = process.hrtime(startTime);
      outputBuffer.writeString('out',
        chalk.bold.gray(`finished in ${chalk.bold.magenta(prettyHrTime(endTime))} `) + chalk.bold.gray(`> ${command}`) + '\n');
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

  const showAndGetError = (outputBuffer: OutputBuffer, code: number | null, signal: string | null) => {
    let err1;
    if (code !== null) {
      err1 = `failed with code ${code}`;
    }
    else {
      err1 = `killed by signal ${signal}`;
    }

    const err2 = `> ${command}`;
    outputBuffer.writeString('err', chalk.bgRed.bold.white(err1) + chalk.bold.red(` ${err2}\n`));
    return new RunError(`${err1} ${err2}`, context);
  };

  resetColors();

  const cwdName = getCwdName();
  let finalCommand = `${command} && ${cwdName} > ${escapeForShell(tmpFilename)}`;
  if (context.cwd) {
    finalCommand = `${getChdirName()} ${escapeForShell(context.cwd)} && ${finalCommand}`;
  }

  return new Promise((resolve, reject) => {
    const outputBuffer = new OutputBuffer(formatContextId(context), {
      out: {
        socket: process.stdout
      },
      err: {
        socket: process.stderr,
        color: 'magenta'
      }
    });

    if (silentLevel <= 1) {
      outputBuffer.writeString('out', chalk.bgYellow.bold.white(`> ${command}`) + '\n');
    }

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
      reject(new MakfyError(`shell could not be spawned - ${err.message}`, context));
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
      printProfileTime(outputBuffer);
      outputBuffer.flush();
      console.log();
      cleanup();

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
          finish(showAndGetError(outputBuffer, code, signal));
        }
      }
      else {
        // killed
        finish(showAndGetError(outputBuffer, code, signal));
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

};
