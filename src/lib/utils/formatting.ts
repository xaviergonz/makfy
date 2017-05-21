import * as chalk from 'chalk';
import { ExecContext } from '../execRuntime';
import Socket = NodeJS.Socket;

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
