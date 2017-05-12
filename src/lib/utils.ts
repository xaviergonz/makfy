import * as chalk from 'chalk';

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

export const getTimeString = () => {
  return chalk.dim.gray(`[${new Date(new Date().getTime()).toLocaleTimeString()}] `);
};

export const errorMessageForObject = (parts: (string | undefined)[], message: string) => {
  return `${parts.filter((e) => e !== undefined).join('.')} - ${message}`;
};

export const argNameToDashedArgName = (argName: string) => {
  return (argName.length <= 1 ? '-' : '--') + argName;
};

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

