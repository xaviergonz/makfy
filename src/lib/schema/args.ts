// tslint:disable:no-object-literal-type-assertion

import { Schema } from "jsonschema";
import { alphanumericExtendedPattern } from "./";

export const reservedArgNames = [
  "f",
  "file",
  "l",
  "list",
  "h",
  "help",
  "v",
  "version",
  "color",
  "noColor",
  "no-color",
  "profile",
  "showTime",
  "show-time"
];

// an optional flag, false by default
export interface FlagArgDefinition {
  type: "flag" | "f";
  byDefault?: false;
  desc?: string;
}

export const flagArgSchema: Schema = {
  id: "/flagArg",
  type: "object",
  required: ["type"],
  properties: {
    type: {
      type: "string",
      enum: ["f", "flag"] // tslint:disable-line:object-literal-key-quotes
    },
    byDefault: {
      type: "boolean",
      enum: [false] // tslint:disable-line:object-literal-key-quotes
    },
    desc: {
      type: "string"
    }
  },
  additionalProperties: false
};

// any string, required if no default value is given
export interface StringArgDefinition {
  type: "string" | "s";
  byDefault?: string;
  desc?: string;
}

export const stringArgSchema: Schema = {
  id: "/stringArg",
  type: "object",
  required: ["type"],
  properties: {
    type: {
      type: "string",
      enum: ["s", "string"] // tslint:disable-line:object-literal-key-quotes
    },
    byDefault: {
      type: "string"
    },
    desc: {
      type: "string"
    }
  },
  additionalProperties: false
};

// an enum, required if not default value is given
// the default value must be inside the enum given in values; values must contain at least one element
export interface EnumArgDefinition {
  type: "enum" | "e";
  values: string[];
  byDefault?: string;
  desc?: string;
}

export const enumArgSchema: Schema = {
  id: "/enumArg",
  type: "object",
  required: ["type", "values"],
  properties: {
    type: {
      type: "string",
      enum: ["e", "enum"] // tslint:disable-line:object-literal-key-quotes
    },
    values: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: {
        type: "string",
        pattern: alphanumericExtendedPattern
      }
    },
    byDefault: {
      type: "string",
      pattern: alphanumericExtendedPattern,
      matchesValues: true
    } as Schema,
    desc: {
      type: "string"
    }
  },
  additionalProperties: false
};

export type ArgDefinition = FlagArgDefinition | StringArgDefinition | EnumArgDefinition;

export type ArgInstance<T extends ArgDefinition> = T extends FlagArgDefinition
  ? boolean
  : T extends StringArgDefinition
    ? string
    : T extends EnumArgDefinition ? string : string | boolean;

export const argSchema: Schema = {
  id: "/arg",
  oneOf: [flagArgSchema, stringArgSchema, enumArgSchema]
};

export const argsSchema: Schema = {
  id: "/args",
  type: "object",
  patternProperties: {
    [alphanumericExtendedPattern]: argSchema
  },
  additionalProperties: false,
  forbiddenPropertyNames: reservedArgNames
} as Schema;

export interface ArgDefinitions {
  [argName: string]: ArgDefinition;
}

export type ArgsInstance<TArgDefs extends ArgDefinitions> = {
  [k in keyof TArgDefs]: ArgInstance<TArgDefs[k]>
};
