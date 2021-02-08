import chalk from "chalk";
import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as yargs from "yargs";
import { MakfyError, RunError } from "./errors";
import { ParsedCommand } from "./parser/command";
import { ArgDefinitions } from "./schema/args";
import { Command } from "./schema/commands";
import { ExecCommand, ExecContext, ExecFunction, ExecObject } from "./schema/runtime";
import { getUtilsContext, setUtilsContext } from "./utils";
import { blockingConsoleError, blockingConsoleLog, resetColors } from "./utils/console";
import { formatContextId, formatContextIdStack } from "./utils/formatting";
import { OutputBuffer } from "./utils/OutputBuffer";
import { limitPromiseConcurrency } from "./utils/promise";
import {
  escapeForShell,
  fixPath,
  getChdirName,
  getCwdName,
  getEnvName,
  getPathDelimiter,
  getPathEnvName,
  getShellType
} from "./utils/shell";
import Timer = NodeJS.Timer;

const prettyHrTime = require("pretty-hrtime");

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

  const oldUtilsContext = getUtilsContext();
  setUtilsContext({
    baseContext,
    warnAsync,
    infoAsync
  });
  try {
    await command.run(execFunc, finalCommandArgs);
  } finally {
    setUtilsContext(oldUtilsContext);
  }
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

  const cmdName = "" + parsed._[0];
  const parsedWithoutExtras: { [x: string]: unknown;} = parsed;
  delete parsedWithoutExtras._;
  delete parsedWithoutExtras.$0;

  await execObjectAsync(
    {
      _: cmdName,
      args: {
        ...(parsedWithoutExtras as any)
      }
    },
    context
  );
};

const execObjectAsync = async (command: ExecObject, context: ExecContext) => {
  const cmdName = command._;
  const args = command.args;
  let cmd: Command<ArgDefinitions>;
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

  return new Promise<void>((resolve, reject) => {
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
      shellCommand = process.env.SHELL! || "sh";
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
