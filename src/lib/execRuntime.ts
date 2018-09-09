import chalk from "chalk";
import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as yargs from "yargs";
import { MakfyError, RunError } from "./errors";
import { ParsedCommand } from "./parser/command";
import { ParsedCommands } from "./parser/commands";
import { Command } from "./schema/commands";
import {
  ExecCommand,
  ExecFunction,
  ExecObject,
  ExecUtils,
  GetFileChangesResult,
  MakfyContext
} from "./schema/runtime";
import { blockingConsoleError, blockingConsoleLog, resetColors } from "./utils/console";
import { formatContextId, formatContextIdStack } from "./utils/formatting";
import { unrollGlobPatternsAsync } from "./utils/globs";
import {
  cacheFolderName,
  createCacheFolder,
  generateHashCollectionAsync,
  getHashCollectionDelta,
  getHashCollectionFilename,
  HashCollection,
  loadHashCollectionFileAsync
} from "./utils/hash";
import { OutputBuffer } from "./utils/OutputBuffer";
import { limitPromiseConcurrency } from "./utils/promise";
import * as shellescape from "./utils/shellescape";
import { isStringArray } from "./utils/typeChecking";
import Timer = NodeJS.Timer;

type ShellType = shellescape.ShellType;

const prettyHrTime = require("pretty-hrtime");

const getShellType = (): ShellType =>
  !process.env.SHELL && process.platform === "win32" ? "cmd" : "sh";
const getPathEnvName = () => (getShellType() === "sh" ? "PATH" : "Path");
const getPathDelimiter = () => path.delimiter;
const getCwdName = () => (getShellType() === "sh" ? "pwd" : "cd");
const getEnvName = () => (getShellType() === "sh" ? "printenv" : "set");
const getChdirName = () => (getShellType() === "sh" ? "cd" : "cd /d");
const escapeForShell = (stringOrArray: string | string[]) =>
  shellescape.escapeShell(getShellType(), stringOrArray);
const fixPath = (pathname: string) => shellescape.fixPath(getShellType(), pathname);

export interface CachedGetFileChangesResult {
  result: GetFileChangesResult;
  oldHashCollection?: HashCollection;
  newHashCollection: HashCollection;
}

export interface ExecContext extends MakfyContext {
  parsedCommands: ParsedCommands;
  makfyFileContents?: string;

  idStack: string[];
  cwd?: string;
  env?: object;
  syncMode: boolean;

  getFileChangesResults: {
    [hashFilename: string]: CachedGetFileChangesResult;
  };
}

const contextIdColors = ["magenta", "green", "yellow", "red", "blue"];

const logWarnAsync = async (idStack: string[], showTime: boolean, str: string) => {
  await blockingConsoleError(
    formatContextIdStack(idStack, showTime) + chalk.bold.red(`[WARN] ${str}`) + "\n"
  );
};

const logInfoAsync = async (idStack: string[], showTime: boolean, str: string) => {
  await blockingConsoleLog(
    formatContextIdStack(idStack, showTime) + chalk.bold.green(`${str}`) + "\n"
  );
};

export const runCommandAsync = async (
  commandName: string,
  commandArgs: { [argName: string]: any },
  baseContext: ExecContext,
  unknownArgMeansError: boolean
) => {
  const { commands, parsedCommands } = baseContext;
  const command = commands[commandName];
  const parsedCommand = parsedCommands[commandName];
  const argDefs = parsedCommand.argDefinitions;

  const baseIdStack = [...baseContext.idStack, chalk.bold.blue(commandName)];

  const warnAsync = async (msg: string) => {
    await logWarnAsync(baseIdStack, baseContext.options.showTime, msg);
  };

  const infoAsync = async (msg: string) => {
    await logInfoAsync(baseIdStack, baseContext.options.showTime, msg);
  };

  // warn for ignored args
  for (const key of Object.keys(commandArgs)) {
    const argDef = argDefs[key];
    if (!argDef) {
      if (unknownArgMeansError) {
        throw new MakfyError(
          `argument '${key}' is not defined as a valid argument for command '${commandName}'`,
          baseContext
        );
      } else {
        await warnAsync(
          `argument '${key}' is not defined as a valid argument for this command and will be ignored`
        );
      }
    }
  }

  // validate arguments and set default values
  const finalCommandArgs: {
    [argName: string]: any;
  } = {};
  Object.keys(argDefs).forEach((key) => {
    const argDef = argDefs[key];
    finalCommandArgs[key] = argDef.parse(commandArgs[key]);
  });

  const execFunc = createExecFunctionContext(baseContext, baseIdStack, true);

  const utils: ExecUtils = {
    makfyContext: {
      commandName: baseContext.commandName,
      commandArgs: baseContext.commandArgs,
      commands: baseContext.commands,
      options: baseContext.options,
      makfyFilename: baseContext.makfyFilename
    },

    getFileChangesAsync: async (contextName, globPatterns, options?) => {
      if (typeof contextName !== "string") {
        throw new MakfyError(`'contextName' argument must be a string`, baseContext);
      }
      if (typeof contextName !== "string" && !isStringArray(globPatterns)) {
        throw new MakfyError(
          `'globPatterns' argument must be a string or an array of strings`,
          baseContext
        );
      }

      options = {
        log: true,
        ...options
      };
      if (contextName === undefined) {
        contextName = "";
      }

      const logChangesAsync = async (fileDeltas: GetFileChangesResult) => {
        if (options!.log) {
          if (!fileDeltas.hasChanges) {
            await infoAsync(`[${contextName}] no files changed`);
          } else {
            if (fileDeltas.cleanRun) {
              await infoAsync(
                `[${contextName}] files changed: clean run - assuming all (${
                  fileDeltas.added.length
                } files)`
              );
            } else {
              await infoAsync(
                `[${contextName}] files changed: ${fileDeltas.unmodified.length} unmodified, ${
                  fileDeltas.modified.length
                } modified, ${fileDeltas.removed.length} removed, ${fileDeltas.added.length} added`
              );
            }
          }
        }
      };

      // try to get a cached result first
      const hashFilename = getHashCollectionFilename(
        baseContext.makfyFileContents || baseContext.makfyFilename,
        contextName,
        "sha1"
      );
      if (baseContext.getFileChangesResults[hashFilename]) {
        const cachedResult = baseContext.getFileChangesResults[hashFilename];
        await logChangesAsync(cachedResult.result);
        return cachedResult.result;
      }

      if (typeof globPatterns === "string") {
        globPatterns = [globPatterns];
      }

      globPatterns = globPatterns.map((e) => e.trim()).filter((e) => e.length > 0);

      let files: string[] = [];
      if (globPatterns.length > 0) {
        // unroll glob patterns
        files = await unrollGlobPatternsAsync(globPatterns);
      }

      createCacheFolder();

      let oldHashCollection;
      //noinspection EmptyCatchBlockJS
      try {
        oldHashCollection = await loadHashCollectionFileAsync(hashFilename);
      } catch (err) {
        // do nothing
      }

      const newHashCollection = await generateHashCollectionAsync(files, "sha1", false);

      const delta = getHashCollectionDelta(oldHashCollection, newHashCollection);

      const cached = {
        result: delta,
        newHashCollection: newHashCollection,
        oldHashCollection: oldHashCollection
      };

      await logChangesAsync(delta);

      baseContext.getFileChangesResults[hashFilename] = cached;

      return delta;
    },

    cleanCache() {
      const deleteFolderRecursive = (dir: string) => {
        if (!fs.existsSync(dir)) {
          return;
        }

        fs.readdirSync(dir).forEach((file) => {
          const curPath = path.join(dir, file);
          if (fs.lstatSync(curPath).isDirectory()) {
            // recurse
            deleteFolderRecursive(curPath);
          } else {
            // delete file
            fs.unlinkSync(curPath);
          }
        });
        fs.rmdirSync(dir);
      };

      const cf = path.join(".", cacheFolderName);
      deleteFolderRecursive(cf);
    },

    escape(...parts) {
      return escapeForShell([...parts]);
    },

    fixPath(pathname, style = "autodetect") {
      let sh: ShellType;
      switch (style) {
        case undefined:
        case "autodetect":
          sh = getShellType();
          break;
        case "windows":
          sh = "cmd";
          break;
        case "posix":
          sh = "sh";
          break;
        default:
          throw new MakfyError(`invalid fixPath style - '${style}'`, baseContext);
      }
      return shellescape.fixPath(sh, pathname);
    },

    setEnvVar(name, value) {
      const shell = getShellType();
      switch (shell) {
        case "sh":
          if (value === undefined) {
            return `unset ${name}`;
          } else {
            return `export ${name}=${escapeForShell(value)}`;
          }
        case "cmd":
          return `set ${name}=${value === undefined ? "" : value}`;
        default:
          throw new MakfyError(`unknown shell type - '${shell}'`, baseContext);
      }
    },

    async expandGlobsAsync(globPatterns) {
      return unrollGlobPatternsAsync(globPatterns);
    },

    limitPromiseConcurrency: limitPromiseConcurrency
  };

  await command.run(execFunc, finalCommandArgs, utils);
};

const createExecFunctionContext = (
  baseContext: ExecContext,
  baseIdStack: string[],
  syncMode: boolean
): ExecFunction => {
  let lastId = 0;

  return async (...execCommands: ExecCommand[]) => {
    const id = String(lastId);
    const color = contextIdColors[lastId % contextIdColors.length];
    lastId++;
    const newExecContext = {
      ...baseContext,
      syncMode: syncMode,
      idStack: [...baseIdStack, chalk.bold.keyword(color)(id)]
    };

    return createExecFunction(newExecContext)(...execCommands);
  };
};

const createExecFunction = (context: ExecContext): ExecFunction => {
  const innerExec = async (...commands: ExecCommand[]) => {
    for (let command of commands) {
      if (command === null || command === undefined) {
        // skip
      } else if (Array.isArray(command)) {
        await execArrayAsync(command, context, innerExec);
      } else if (typeof command === "object") {
        await execObjectAsync(command as ExecObject, context);
      } else if (typeof command === "string") {
        command = command.trim();
        if (command === "") {
          // skip
        } else if (command.startsWith("@")) {
          await execCSubcmmandStringAsync(command, context);
        } else if (command.startsWith("?")) {
          await execHelpStringAsync(command, context);
        }
        // TODO: decide if this is a good idea or not (shx rm sometimes hangs)
        // else if (command.startsWith('>')) {
        //   await execShxStringAsync(command, context);
        // }
        else {
          await execCommandStringAsync(command, context);
        }
      }
    }

    return {
      keepContext: innerExec
    };
  };

  return innerExec;
};

const execShxStringAsync = async (command: string, context: ExecContext) => {
  // strip > at the beginning
  command = command.substr(1).trim();

  let preCommand = "";
  if (command.startsWith("%%")) {
    preCommand = "%%";
    command = command.substr(2).trim();
  } else if (command.startsWith("%")) {
    preCommand = "%";
    command = command.substr(1).trim();
  }

  const finalCommand = `${preCommand} shx ${command}`;
  await execCommandStringAsync(finalCommand, context /*, command*/);
};

const execArrayAsync = async (
  commands: ExecCommand[],
  baseContext: ExecContext,
  execFunction: ExecFunction
) => {
  if (baseContext.syncMode) {
    // turning into parallel mode
    const baseIdStack = [...baseContext.idStack];
    const execFunc = createExecFunctionContext(baseContext, baseIdStack, false);

    // limit promise concurrency to 32
    const limit = limitPromiseConcurrency(32);

    const all = commands.map((cmd) => limit(() => execFunc(cmd)));
    await Promise.all(all);
  } else {
    // turning into sync mode
    await execFunction(...commands);
  }
};

const execCSubcmmandStringAsync = async (command: string, context: ExecContext) => {
  // strip @ at the beginning
  command = command.substr(1).trim();
  const parsed = yargs.parse(command);

  if (parsed._.length === 0) {
    throw new MakfyError("one command name must be present in a subcommand string", context);
  }

  if (parsed._.length > 1) {
    throw new MakfyError(
      `only a single command name is allowed in a subcommand string, but there were ${
        parsed._.length
      }: ${parsed._.join(", ")}`,
      context
    );
  }

  const cmdName = parsed._[0];
  delete parsed._;
  delete parsed.$0;

  await execObjectAsync(
    {
      _: cmdName,
      args: {
        ...parsed
      }
    },
    context
  );
};

const execObjectAsync = async (command: ExecObject, context: ExecContext) => {
  const cmdName = command._;
  const args = command.args;
  let cmd: Command;
  let parsedCmd: ParsedCommand;

  if (typeof cmdName === "string") {
    cmd = context.commands[cmdName];
    parsedCmd = context.parsedCommands[cmdName];
    if (!cmd || !parsedCmd) {
      throw new MakfyError(
        `'_' property references command '${cmdName}', which is not present`,
        context
      );
    }
  } else {
    throw new MakfyError(
      `'_' property must be either a command name or a single command object`,
      context
    );
  }

  // cmd now is a command object
  await runCommandAsync(cmdName, args || {}, context, true);
};

const execHelpStringAsync = async (command: string, context: ExecContext) => {
  await blockingConsoleLog(
    "\n" + formatContextId(context) + chalk.bgBlue.bold.white(`${command.substr(1).trim()}`) + "\n"
  );
};

const execCommandStringAsync = async (
  command: string,
  context: ExecContext,
  commandDisplay?: string
) => {
  // add node_modules/.bin to path if needed
  const pathEnvName = getPathEnvName();
  let currentPath = process.env[pathEnvName] || "";
  const nodeBinPath = path.resolve(path.join("node_modules/.bin")) + getPathDelimiter();
  if (!currentPath.startsWith(nodeBinPath)) {
    currentPath = nodeBinPath + currentPath;
  }
  const env = {
    ...process.env,
    ...context.env,
    [pathEnvName]: currentPath
  };

  const startTime = process.hrtime();

  let silentLevel = 0;
  if (command.startsWith("%%")) {
    silentLevel = 2;
    command = command.substr(2);
  } else if (command.startsWith("%")) {
    silentLevel = 1;
    command = command.substr(1);
  }
  command = command.trim();

  if (!commandDisplay) {
    commandDisplay = command.trim();
  }

  const printProfileTime = (outputBuffer: OutputBuffer) => {
    if (context.options.profile && silentLevel < 2) {
      const endTime = process.hrtime(startTime);
      outputBuffer.writeString(
        "out",
        chalk.bold.gray(`finished in ${chalk.bold.magenta(prettyHrTime(endTime))} `) +
          chalk.bold.gray(`> ${commandDisplay}`) +
          "\n"
      );
    }
  };

  // get a tmp file to save the current working dir and env
  const cwdTmpFilename = tmp.tmpNameSync({ prefix: "makfy-" });
  const envTmpFilename = tmp.tmpNameSync({ prefix: "makfy-" });
  const cleanup = () => {
    //noinspection EmptyCatchBlockJS
    try {
      fs.unlinkSync(cwdTmpFilename);
    } catch (err) {
      // do nothing
    }
    //noinspection EmptyCatchBlockJS
    try {
      fs.unlinkSync(envTmpFilename);
    } catch (err) {
      // do nothing
    }
    resetColors();
  };

  const showAndGetError = (
    outputBuffer: OutputBuffer,
    code: number | null,
    signal: string | null
  ) => {
    let err1;
    if (code !== null) {
      err1 = `failed with code ${code}`;
    } else {
      err1 = `killed by signal ${signal}`;
    }

    const err2 = `> ${commandDisplay}`;
    outputBuffer.writeString("err", chalk.bgRed.bold.white(err1) + chalk.bold.red(` ${err2}\n`));
    return new RunError(`${err1} ${err2}`, context);
  };

  resetColors();

  // add to the final command two extra commands to save the cwd and current env
  let finalCommand = `${command} && ${getCwdName()} > ${escapeForShell(
    fixPath(cwdTmpFilename)
  )} && ${getEnvName()} > ${escapeForShell(fixPath(envTmpFilename))}`;
  if (context.cwd) {
    // set the cwd
    finalCommand = `${getChdirName()} ${escapeForShell(fixPath(context.cwd))} && ${finalCommand}`;
  }

  return new Promise((resolve, reject) => {
    const outputBuffer = new OutputBuffer(formatContextId(context), {
      out: {
        socket: process.stdout
      },
      err: {
        socket: process.stderr,
        color: "magenta"
      }
    });

    if (silentLevel <= 1) {
      outputBuffer.writeString("out", chalk.bgBlue.bold.white(`> ${commandDisplay}`) + "\n");
    }

    let shellCommand;
    let shellArgs: string[];
    let useShell;
    if (getShellType() === "cmd") {
      useShell = true;
      shellCommand = finalCommand;
      shellArgs = [];
    } else {
      useShell = false;
      shellCommand = process.env.SHELL!;
      shellArgs = ["-c", finalCommand];
    }

    const childProc = child_process.spawn(shellCommand, shellArgs, {
      env: env,
      shell: useShell,
      stdio: ["pipe", silentLevel === 0 ? "pipe" : "ignore", "pipe"] // we use pipe on stdin to fix some weird hangs on windows
    });

    let exitDone = false;

    childProc.once("error", (err) => {
      if (exitDone) {
        return;
      }
      exitDone = true;

      cleanup();
      reject(new MakfyError(`shell could not be spawned - ${err.message}`, context));
    });

    // flush output every second
    let flushInterval: Timer | undefined = setInterval(async () => {
      await outputBuffer.flushAsync();
    }, 1000);

    const finishAsync = async (error?: Error) => {
      if (flushInterval) {
        clearInterval(flushInterval);
        flushInterval = undefined;
      }
      printProfileTime(outputBuffer);
      await outputBuffer.flushAsync();
      cleanup();

      if (error) {
        reject(error);
      }
      resolve();
    };

    childProc.once("close", async (code, signal) => {
      if (exitDone) {
        return;
      }
      exitDone = true;

      if (code !== null) {
        if (code === 0) {
          // standard exit

          // read the temp file with the new cwd
          context.cwd = fs
            .readFileSync(cwdTmpFilename, "utf8")
            .replace(/\r?\n|\r/g, "")
            .trim();

          // read the temp file with the new env
          const newEnv: {
            [envVarName: string]: string;
          } = {};

          fs.readFileSync(envTmpFilename, "utf8")
            .replace(/\r/g, "")
            .trim()
            .split("\n")
            .forEach((envLine) => {
              if (envLine.trim().length > 0) {
                const pieces = envLine.split("=");
                const name = pieces[0];
                newEnv[name] = envLine.substr(name.length + 1);
              }
            });
          context.env = newEnv;

          await finishAsync();
        } else {
          await finishAsync(showAndGetError(outputBuffer, code, signal));
        }
      } else {
        // killed
        await finishAsync(showAndGetError(outputBuffer, code, signal));
      }
    });

    if (childProc.stdout) {
      childProc.stdout.on("data", (data: Buffer) => {
        outputBuffer.write({
          type: "out",
          data: data
        });
      });
    }

    if (childProc.stderr) {
      childProc.stderr.on("data", (data: Buffer) => {
        outputBuffer.write({
          type: "err",
          data: data
        });
      });
    }
  });
};
