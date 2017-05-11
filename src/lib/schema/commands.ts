import { Schema } from 'jsonschema';
import { alphanumericPattern } from './';
import { ArgDefinition, argsSchema } from './args';
import { ExecFunction } from './runtime';

export interface Command {
  desc?: string;
  args: {
    [argName: string]: ArgDefinition;
  };
  internal?: boolean;
  run(exec: ExecFunction, args: object): void;
}

export const commandSchema: Schema = {
  id: '/command',
  type: 'object',
  required: ['run'],
  properties: {
    desc: {
      type: 'string'
    },
    args: argsSchema,
    run: {
      isFunction: true
    } as Schema

  },
  additionalProperties: false,
};


export interface Commands {
  [commandName: string]: Command;
}

export const commandsSchema: Schema = {
  id: '/commands',
  type: 'object',
  patternProperties: {
    [alphanumericPattern]: commandSchema
  },
  additionalProperties: false,
};
