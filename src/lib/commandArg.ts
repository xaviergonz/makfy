import { MakfyError } from './errors';
import { validateInstance } from './schema';
import { ArgDefinition, argSchema, EnumArgDefinition, FlagArgDefinition, StringArgDefinition } from './schema/args';
import { errorMessageForObject } from './utils';

const enum Type {
  Flag,
  String,
  Enum
}

const normalizeType = (type: string) => {
  if (type === 'f' || type === 'flag') {
    return Type.Flag;
  }
  if (type === 's' || type === 'string') {
    return Type.String;
  }
  if (type === 'e' || type === 'enum') {
    return Type.Enum;
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

  const normalizedType = normalizeType(argDefinition.type);

  const validateError = (err: string): MakfyError => {
    return new MakfyError(`Argument '${argName}' - ${err}`);
  };

  let parse: ParseArgFunction;
  const argRequiredMessage = 'argument is required';

  if (normalizedType === Type.Flag) {
    let {byDefault} = argDefinition as FlagArgDefinition;
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
  else if (normalizedType === Type.String) {
    const {byDefault} = argDefinition as StringArgDefinition;

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
  else if (normalizedType === Type.Enum) {
    const {byDefault, values} = argDefinition as EnumArgDefinition;

    parse = (value: any) => {
      if (value === undefined) value = byDefault;
      if (value === undefined) throw validateError(argRequiredMessage);
      if (typeof value === 'number') {
        value = String(value);
      }
      if (typeof value !== 'string' || !values.includes(value)) {
        throw validateError(`argument must be one of: ${values.join(', ')}`);
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
  const normalizedType = normalizeType(argDefinition.type);

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

  switch (normalizedType) {
    case Type.Flag:
      return getHelpString(undefined, 'false');
    case Type.String:
      return getHelpString('string', byDefault);
    case Type.Enum:
      const { values } = argDefinition as EnumArgDefinition;
      return getHelpString(values.join('|'), byDefault);
    default:
      throw new Error(`internal error - unknown type: ${normalizedType}`);
  }
};
