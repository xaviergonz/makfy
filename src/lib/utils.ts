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

export const isAlphanumericString = (str: string, emptyIsValid = false) => {
  if (str.length <= 0) {
    return emptyIsValid;
  }
  return (/^[a-z0-9]+$/i.test(str));
};

export const isAlphanumericStringArray = (arr: any) => {
  if (!Array.isArray(arr)) {
    return false;
  }
  for (const e of arr) {
    if (!isAlphanumericString(e)) {
      return false;
    }
  }
  return true;
};

export const getTimeString = () => {
  return chalk.dim.gray(`[${new Date(new Date().getTime()).toLocaleTimeString()}] `);
};

export const errorMessageForObject = (parts: (string | undefined)[], message: string) => {
  return `${parts.filter((e) => e !== undefined).join('.')} - ${message}`;
};

export class Writer {
  output: string = '';

  writeLine(str?: string) {
    this.output += (str ? str : '') + '\n';
  }
}

