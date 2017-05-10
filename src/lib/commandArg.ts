import { MakfyError } from './errors';
import { isAlphanumericStringArray, errorMessageForObject } from './utils';
import { argSchema, validateInstance } from './schema';

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

export type ParseArgFunction = (value: any) => any;

export interface ParsedArgDefinition {
  help: string;
  parse: ParseArgFunction;
}

export const parseArgDefinition = (cmdName: string, argName: string, argDefinition: ArgDefinition, skipValidation: boolean): ParsedArgDefinition => {
  const error = (property: string | undefined, message: string): MakfyError => {
    return new MakfyError(errorMessageForObject(['commands', cmdName, 'args', argName, property], message));
  };

  if (!skipValidation) {
    const validationResult = validateInstance(argDefinition, argSchema);
    if (!validationResult.valid) {
      throw error(undefined, validationResult.toString());
    }
  }

  const normalizedKind = normalizeKind(argDefinition.kind);

  const validateError = (err: string): MakfyError => {
    return new MakfyError(`Argument '${argName}' - ${err}`);
  };

  let parse: ParseArgFunction;
  const argRequiredMessage = 'argument is required';

  if (normalizedKind === Kind.Flag) {
    let {byDefault, kind} = argDefinition as FlagArgDefinition;
    byDefault = false;

    parse = (value: any) => {
      if (value === undefined) value = byDefault;
      if (value === undefined) throw validateError(argRequiredMessage);
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw validateError(`a flag argument cannot have a value`);
    };
  }
  else if (normalizedKind === Kind.String) {
    const {byDefault, kind} = argDefinition as StringArgDefinition;

    parse = (value: any) => {
      if (value === undefined) value = byDefault;
      if (value === undefined) throw validateError(argRequiredMessage);
      if (typeof value === 'number') {
        value = String(value);
      }
      if (typeof value !== 'string') {
        throw validateError('argument must be a string');
      }
      return value;
    };
  }
  else if (normalizedKind === Kind.Choice) {
    const {byDefault, kind} = argDefinition as ChoiceArgDefinition;

    parse = (value: any) => {
      if (value === undefined) value = byDefault;
      if (value === undefined) throw validateError(argRequiredMessage);
      if (typeof value === 'number') {
        value = String(value);
      }
      if (typeof value !== 'string' || !kind.includes(value)) {
        throw validateError(`argument must be one of: ${kind.join(', ')}`);
      }
      return value;
    };
  }
  else {
    throw new Error('internal error - validation failed?');
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
      throw new Error(`internal error - unknown kind: ${normalizedKind}`);
  }
};
