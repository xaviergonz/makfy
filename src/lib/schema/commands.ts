// tslint:disable:no-object-literal-type-assertion

import { Schema } from "jsonschema";
import { config } from "../config";
import { alphanumericExtendedPattern } from "./";
import { ArgDefinitions, ArgsInstance, argsSchema, ArgDefinition } from "./args";
import { ExecCommand, ExecFunction } from "./runtime";

export type CommandRunFn<TArgDefs extends ArgDefinitions> = (
  exec: ExecFunction,
  args: ArgsInstance<TArgDefs>
) => Promise<void>;

export interface Command<TArgDefs extends ArgDefinitions> {
  desc?: string;
  args?: TArgDefs;
  run: CommandRunFn<TArgDefs>;
}

export const commandSchema: Schema = {
  id: "/command",
  type: "object",
  required: ["run"],
  properties: {
    desc: {
      type: "string",
    },
    args: argsSchema,
    run: {
      isFunction: true,
    } as Schema,
  },
  additionalProperties: false,
};

export interface Commands {
  [commandName: string]: Command<ArgDefinitions>;
}

export const commandsSchema: Schema = {
  id: "/commands",
  type: "object",
  patternProperties: {
    [alphanumericExtendedPattern]: commandSchema,
  },
  additionalProperties: false,
};

export function isInternalCommand(commandName: string) {
  return commandName.startsWith("_");
}

export class CommandBuilder<TArgDefs extends ArgDefinitions> {
  private _command: Partial<Command<TArgDefs>> = {};

  constructor(private readonly name: string) {}

  desc(desc: string): this {
    this._command.desc = desc;
    return this;
  }

  args<TNewArgDefs extends ArgDefinitions>(argDefs: TNewArgDefs): CommandBuilder<TNewArgDefs> {
    this._command.args = argDefs as any;
    return (this as any) as CommandBuilder<TNewArgDefs>;
  }

  argsDesc(argDescs: { [k in keyof TArgDefs]?: string }): this {
    this._command.args = this._command.args || ({} as any);

    Object.keys(argDescs).forEach((argName: keyof TArgDefs) => {
      const desc = argDescs[argName];

      const argObj = (this._command.args![argName] =
        this._command.args![argName] || ({} as ArgDefinition));
      Object.assign(argObj, { desc });
    });

    return this;
  }

  // short version
  run(runFn: CommandRunFn<TArgDefs>): void;

  // long version
  run(...inlineCommands: ExecCommand[]): void;

  // base
  run(...cmdOrCommands: any[]): void {
    let runFn;
    if (cmdOrCommands.length === 1 && typeof cmdOrCommands[0] === "function") {
      runFn = cmdOrCommands[0];
    } else {
      runFn = async (exec: ExecFunction) => {
        await exec(...cmdOrCommands);
      };
    }

    config.commands[this.name] = {
      ...this._command,
      run: runFn,
    };
  }
}
export function cmd(name: string): CommandBuilder<{}> {
  return new CommandBuilder(name);
}
