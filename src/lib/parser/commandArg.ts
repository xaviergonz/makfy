import chalk from "chalk";
import { MakfyError } from "../errors";
import { validateInstance } from "../schema";
import {
  ArgDefinition,
  argSchema,
  EnumArgDefinition,
  FlagArgDefinition,
  StringArgDefinition
} from "../schema/args";
import { argNameToDashedArgName, errorMessageForObject } from "../utils/formatting";

const enum Type {
  Flag,
  String,
  Enum
}

const normalizeType = (type: string) => {
  if (type === "f" || type === "flag") {
    return Type.Flag;
  }
  if (type === "s" || type === "string") {
    return Type.String;
  }
  if (type === "e" || type === "enum") {
    return Type.Enum;
  }
  return undefined;
};

export type ParseArgFunction = (value: any) => any;

export interface ParsedArgDefinition {
  leftHelp: string;
  rightHelp?: string;
  required: boolean;
  parse: ParseArgFunction;
}

export const parseArgDefinition = (
  cmdName: string,
  argName: string,
  argDefinition: ArgDefinition,
  skipValidation: boolean
): ParsedArgDefinition => {
  const error = (property: string | undefined, message: string): MakfyError => {
    return new MakfyError(
      errorMessageForObject(["commands", cmdName, "args", argName, property], message),
      undefined
    );
  };

  if (!skipValidation) {
    const validationResult = validateInstance(argDefinition, argSchema);
    if (!validationResult.valid) {
      throw error(undefined, validationResult.toString());
    }
  }

  const normalizedType = normalizeType(argDefinition.type);

  const validateError = (err: string): MakfyError => {
    return new MakfyError(`argument '${argName}' - ${err}`, undefined);
  };

  let parse: ParseArgFunction;
  let required;
  const argRequiredMessage = "argument is required";

  if (normalizedType === Type.Flag) {
    let { byDefault } = argDefinition as FlagArgDefinition;
    byDefault = false;
    required = false;

    parse = (value: any) => {
      if (value === undefined) {
        value = byDefault;
      }
      if (value === undefined) {
        throw validateError(argRequiredMessage);
      }
      if (typeof value === "boolean") {
        return value;
      }
      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }
      throw validateError(`a flag argument cannot have a value`);
    };
  } else if (normalizedType === Type.String) {
    const { byDefault } = argDefinition as StringArgDefinition;
    required = byDefault === undefined;

    parse = (value: any) => {
      if (value === undefined) {
        value = byDefault;
      }
      if (value === undefined) {
        throw validateError(argRequiredMessage);
      }
      if (typeof value === "number") {
        value = String(value);
      }
      if (typeof value !== "string") {
        throw validateError("argument must be a string");
      }
      return value;
    };
  } else if (normalizedType === Type.Enum) {
    const { byDefault, values } = argDefinition as EnumArgDefinition<string>;
    required = byDefault === undefined;

    parse = (value: any) => {
      if (value === undefined) {
        value = byDefault;
      }
      if (value === undefined) {
        throw validateError(argRequiredMessage);
      }
      if (typeof value === "number") {
        value = String(value);
      }
      if (typeof value !== "string" || !values.includes(value)) {
        throw validateError(`argument must be one of: ${values.join(", ")}`);
      }
      return value;
    };
  } else {
    throw new Error("internal error - validation failed?");
  }

  return {
    ...getHelpForArg(argName, argDefinition),
    required,
    parse
  };
};

const getHelpForArg = (argName: string, argDefinition: ArgDefinition & { byDefault?: any }) => {
  const { byDefault, desc } = argDefinition;
  const normalizedType = normalizeType(argDefinition.type);

  const getLeftHelp = (equals: string | undefined, required: boolean) => {
    let str = argNameToDashedArgName(argName);
    if (required) {
      str = chalk.bold.red(str);
    } else {
      str = chalk.bold.magenta(str);
    }

    if (equals) {
      str += chalk.bold.gray(`=${equals}`);
    }

    return str;
  };

  const getRightHelp = (equals: string | undefined, defaultValue: any) => {
    let str = "";
    if (desc) {
      str = chalk.bold.gray(desc);
    }
    if (defaultValue) {
      str += chalk.bold.gray(" (default: " + defaultValue + ")");
    }

    return str.length > 0 ? str : undefined;
  };

  const getHelp = (equals: string | undefined, defaultValue: any) => {
    return {
      leftHelp: getLeftHelp(equals, defaultValue === undefined),
      rightHelp: getRightHelp(equals, defaultValue)
    };
  };

  switch (normalizedType) {
    case Type.Flag:
      return getHelp(undefined, "false");
    case Type.String:
      return getHelp("string", byDefault);
    case Type.Enum:
      const { values } = argDefinition as EnumArgDefinition<string>;
      return getHelp(values.join("|"), byDefault);
    default:
      throw new Error(`internal error - unknown type: ${normalizedType}`);
  }
};
