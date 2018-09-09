// tslint:disable:no-object-literal-type-assertion

import { Schema } from "jsonschema";
import { alphanumericExtendedPattern } from "./";
import { ArgDefinitions, ArgsInstance, argsSchema } from "./args";
import { ExecFunction, ExecUtils } from "./runtime";

export interface Command<TArgDefs extends ArgDefinitions> {
  desc?: string;
  args?: TArgDefs;
  internal?: boolean;
  run(exec: ExecFunction, args: ArgsInstance<TArgDefs>, utils: ExecUtils): void;
}

export const commandSchema: Schema = {
  id: "/command",
  type: "object",
  required: ["run"],
  properties: {
    desc: {
      type: "string"
    },
    args: argsSchema,
    run: {
      isFunction: true
    } as Schema,
    internal: {
      type: "boolean"
    }
  },
  additionalProperties: false
};

export interface Commands {
  [commandName: string]: Command<ArgDefinitions> & { readonly $fromCommandFunction: undefined };
}

export const commandsSchema: Schema = {
  id: "/commands",
  type: "object",
  patternProperties: {
    [alphanumericExtendedPattern]: commandSchema
  },
  additionalProperties: false
};

// only used for Ts typings
export function command<TArgDefs extends ArgDefinitions = {}>(
  cmd: Command<TArgDefs>
): Command<TArgDefs> & { readonly $fromCommandFunction: undefined } {
  return cmd as any;
}
