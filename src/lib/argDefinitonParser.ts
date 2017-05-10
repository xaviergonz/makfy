import { MakfyError } from './errors';
import { isAlphanumericString, isAlphanumericStringArray } from './utils';
import { validateValues, Schema } from './validation';

export const reservedArgs = ['f', 'file', 'l', 'list', 'h', 'help', 'v', 'version', 'color', 'no-color'];

/*
 { kind: 'flag' or 'f' } - an optional flag, false by default
 { kind: 'string' or 's', byDefault: '' } - any string, required if no defaultValue is given
 { kind: [ STRA, STRB, STRC], byDefault: STRA } - a choice, required if not defaultValue is given
 */
// an optional flag, false by default
export interface FlagArgDefinition {
  kind: 'flag' | 'f';
  byDefault?: false;
  desc?: string;
}

// any string, required if no default value is given
export interface StringArgDefinition {
  kind: 'string' | 's';
  byDefault?: string;
  desc?: string;
}

// a choice, required if not default value is given
// the default value must be inside the choices given in kind; kind must contain at least one element
export interface ChoiceArgDefinition {
  kind: string[];
  byDefault?: string;
  desc?: string;
}

export type ArgDefinition = FlagArgDefinition | StringArgDefinition | ChoiceArgDefinition;

// valid arg definitions
const argDefinitionSchema: Schema = {
  kind: {
    type: 'any'
  },
  byDefault: {
    type: 'any'
  },
  desc: {
    type: 'string'
  }
};

const enum Kind {
  Flag,
  String,
  Choice
}

const normalizeKind = (kind: any) => {
  if (kind === 'f' || kind === 'flag') {
    return Kind.Flag;
  }
  if (kind === 's' || kind === 'string') {
    return Kind.String;
  }
  if (isAlphanumericStringArray(kind)) {
    return Kind.Choice;
  }
  return undefined;
};

export const parseArgDefinition = (cmdName: string, argName: string, argDefinition: ArgDefinition) => {
  const error = (err: string) => {
    throw new MakfyError(`Command '${cmdName}' - Argument '${argName}' - Definition error: ${err}`);
  };

  if (reservedArgs.includes(argName)) {
    error(`name is reserved and cannot be reused`);
  }

  if (!isAlphanumericString(argName)) {
    error('name must be alphanumeric');
  }

  const validationResult = validateValues(argDefinitionSchema, argDefinition, false, false);
  if (validationResult) {
    error(validationResult);
  }

  const normalizedKind = normalizeKind(argDefinition.kind);

  const validateError = (err: string): never => {
    throw new MakfyError(`Argument '${argName}' - ${err}`);
  };

  const validateRequired = (value: any) => {
    if (value === undefined) {
      validateError('argument is required');
    }
  };

  let parse;

  if (normalizedKind === Kind.Flag) {
    let {byDefault, kind} = argDefinition as FlagArgDefinition;

    if (byDefault !== undefined) {
      error('flag arguments cannot have default values, they are false by default');
    }
    byDefault = false;

    parse = (value: any) => {
      if (value === undefined) value = byDefault;
      validateRequired(value);
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      validateError(`a flag argument cannot have a value`);
      // will never get here
      return undefined;
    };
  }
  else if (normalizedKind === Kind.String) {
    const {byDefault, kind} = argDefinition as StringArgDefinition;

    if (byDefault !== undefined && typeof byDefault !== 'string') {
      error(`'byDefault' must be a string or undefined`);
    }

    parse = (value: any) => {
      validateRequired(value);
      if (typeof value === 'number') {
        value = String(value);
      }
      if (typeof value !== 'string') {
        validateError('argument must be a string');
      }
      return value;
    };
  }
  else if (normalizedKind === Kind.Choice) {
    const {byDefault, kind} = argDefinition as ChoiceArgDefinition;

    if (kind.length < 1) {
      error('a choice argument must have at least one string');
    }
    if (byDefault !== undefined && !kind.includes(byDefault)) {
      error(`'byDefault' must be one of (${kind.join(' | ')})`);
    }

    parse = (value: any) => {
      validateRequired(value);
      if (typeof value === 'number') {
        value = String(value);
      }
      if (typeof value !== 'string' || !kind.includes(value)) {
        validateError(`argument must be one of: ${kind.join(', ')}`);
      }
      return value;
    };
  }
  else {
    error(`unknown kind property value, it must be either 'flag', 'string' or a string array (choice)`);
  }

  return {
    help: getHelpForArg(argName, argDefinition),
    parse: parse
  };
};

const getHelpForArg = (argName: string, argDefinition: ArgDefinition) => {
  const { byDefault, desc } = argDefinition;
  const normalizedKind = normalizeKind(argDefinition.kind);

  const getHelpString = (equals: string | undefined, defaultValue: any) => {
    let str = (argName.length <= 1 ? '-' : '--') + argName;
    if (equals) {
      str = `${str}=${equals}`;
    }
    if (defaultValue) {
      str = `(opt) ${str}`;
    }
    else {
      str = `(req) ${str}`;
    }
    if (desc) {
      str = `${str} - ${desc}`;
    }
    if (defaultValue) {
      str = `${str} (default: ${defaultValue})`;
    }
    else {
      str = `${str} (no default)`;
    }
    return str;
  };

  switch (normalizedKind) {
    case Kind.Flag:
      return getHelpString(undefined, 'false');
    case Kind.String:
      return getHelpString('string', byDefault);
    case Kind.Choice:
      const { kind } = argDefinition as ChoiceArgDefinition;
      return getHelpString(kind.join('|'), byDefault);
    default:
      throw new Error(`Internal error - Unknown kind: ${normalizedKind}`);
  }
};
