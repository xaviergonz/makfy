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

