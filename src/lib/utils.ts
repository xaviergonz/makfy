import * as chalk from 'chalk';
import { ExecContext } from './execRuntime';
import Socket = NodeJS.Socket;

const glob = require('glob');

export const resetColors = () => {
  const reset = chalk.reset('');
  process.stdout.write(reset);
  process.stderr.write(reset);
};

export const isObject = (obj: any) => {
  return obj !== null && typeof obj === 'object';
};

export const isFunction = (func: any) => {
  return typeof func === 'function';
};

export const getTimeString = (show: boolean) => {
  if (!show) return '';
  return chalk.bold.gray(`[${new Date(new Date().getTime()).toLocaleTimeString()}] `);
};

export const errorMessageForObject = (parts: (string | undefined)[], message: string) => {
  return `${parts.filter((e) => e !== undefined).join('.')} - ${message}`;
};

export const argNameToDashedArgName = (argName: string) => {
  return (argName.length <= 1 ? '-' : '--') + argName;
};

// TODO: remove this?
export const objectToCommandLineArgs = (obj: any) => {
  const arr = [];

  // command name
  if (obj.$0) {
    arr.push(obj.$0);
  }

  // non args array
  if (obj._) {
    arr.push(...obj._);
  }

  for (const argName of Object.keys(obj)) {
    switch (argName) {
      case '$0':
      case '_':
        break;
      default:
        const argValue = obj[argName];
        if (argValue === undefined || argValue === null) {
          arr.push(argNameToDashedArgName(argName));
        }
        else {
          arr.push(...[argNameToDashedArgName(argName), argValue.toString()]);
        }
        break;
    }
  }

  return arr;
};

export const formatContextIdStack = (idStack: string[], showTime: boolean) => {
  return getTimeString(showTime) + idStack.join(chalk.bold.gray('/')) + '  ';
};

export const formatContextId = (context: ExecContext) => {
  return formatContextIdStack(context.idStack, context.options.showTime);
};

export const unrollGlobPatternAsync = async (globPattern: string): Promise<string[]> => {
  return await new Promise<string[]>((resolve, reject) => {
    glob(globPattern, { strict: true, nodir: true }, (err: Error | null, files: string[]) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(files);
    });

  });
};

export const unrollGlobPatternsAsync = async (globPatterns: string[]): Promise<string[]>  => {
  const set = new Set();
  for (const globPattern of globPatterns) {
    const files = await unrollGlobPatternAsync(globPattern);
    for (const file of files) {
      set.add(file);
    }
  }
  return [...set];
};

export const socketFlushWriteAsync = async (socket: Socket, str: string) => {
  await new Promise((resolve) => {
    const flushed = socket.write(str);
    if (flushed) {
      resolve();
    }
    else {
      socket.once('drain', resolve);
    }
  });
};

export const blockingConsoleLog = async (str: string = '') => {
  await socketFlushWriteAsync(process.stdout, str);
};

export const blockingConsoleError = async (str: string = '') => {
  await socketFlushWriteAsync(process.stderr, str);
};

export class TextWriter {
  output: string = '';

  write(str?: string) {
    this.output += (str ? str : '');
  }

  writeLine(str?: string) {
    this.write(str);
    this.write('\n');
  }
}

