import { Options, Schema, SchemaContext, Validator, ValidatorResult } from 'jsonschema';

const alphanumericPattern = '^[a-zA-Z0-9]+$';

export const reservedArgNames = [
  'f', 'file',
  'l', 'list',
  'h', 'help',
  'v', 'version',
  'color', 'no-color',
  'profile'
];

export const optionsSchema: Schema = {
  id: '/options',
  type: 'object',
  required: [],
  properties: {
    profile: {
      type: 'boolean'
    }
  },
  additionalProperties: false,
};

export const flagArgSchema: Schema = {
  id: '/flagArg',
  type: 'object',
  required: ['kind'],
  properties: {
    kind: {
      type: 'string',
      'enum': [ 'f', 'flag' ] // tslint:disable-line:object-literal-key-quotes
    },
    byDefault: [ false ],
    desc: {
      type: 'string'
    },
  },
  additionalProperties: false,
};

export const stringArgSchema: Schema = {
  id: '/stringArg',
  type: 'object',
  required: ['kind'],
  properties: {
    kind: {
      type: 'string',
      'enum': [ 's', 'string' ] // tslint:disable-line:object-literal-key-quotes
    },
    byDefault: {
      type: 'string'
    },
    desc: {
      type: 'string'
    },
  },
  additionalProperties: false,
};

export const choiceArgSchema: Schema = {
  id: '/choiceArg',
  type: 'object',
  required: ['kind'],
  properties: {
    kind: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: {
        type: 'string',
        pattern: alphanumericPattern
      }
    },
    byDefault: {
      type: 'string',
      pattern: alphanumericPattern,
      matchesKind: true
    } as Schema,
    desc: {
      type: 'string'
    },
  },
  additionalProperties: false,
};

export const argSchema: Schema = {
  id: '/arg',
  oneOf: [
    { $ref: '/flagArg' } as Schema,
    { $ref: '/stringArg' } as Schema,
    { $ref: '/choiceArg' } as Schema,
  ]
};

export const argsSchema: Schema = {
  id: '/args',
  type: 'object',
  patternProperties: {
    [alphanumericPattern]: { $ref: '/arg' } as Schema,
  },
  additionalProperties: false,
  forbiddenPropertyNames: reservedArgNames
} as Schema;

export const commandSchema: Schema = {
  id: '/command',
  type: 'object',
  required: ['run'],
  properties: {
    desc: {
      type: 'string'
    },
    args: {
      $ref: '/args'
    } as Schema,
    run: {
      isFunction: true
    } as Schema

  },
  additionalProperties: false,
};

export const commandsSchema: Schema = {
  id: '/commands',
  type: 'object',
  patternProperties: {
    [alphanumericPattern]: {
      $ref: '/command'
    } as Schema
  },
  additionalProperties: false,
};

export const validateInstance = (obj: object, sch: Schema): ValidatorResult => {
  const v = new Validator();

  (v.attributes as any).isFunction = (instance: any, schema: Schema) => {
    if (!(schema as any).isFunction) return;

    if (typeof instance !== 'function') {
      return 'must be a function';
    }
    return undefined;
  };

  (v.attributes as any).matchesKind = (instance: any, schema: Schema, options: Options, ctx: SchemaContext) => {
    if (!(schema as any).matchesKind) return;

    if (instance === undefined) return undefined;
    const path = ctx.propertyPath.split('.');
    const command = path[1];
    const arg = path[3];
    const kind = obj[command].args[arg].kind;
    if (!Array.isArray(kind)) return undefined;

    if (typeof instance !== 'string') {
      return 'must be a string';
    }
    if (!kind.includes(instance)) {
      return `must be one of: ${kind.join(', ')}`;
    }

    return undefined;
  };

  (v.attributes as any).forbiddenPropertyNames = (instance: any, schema: Schema) => {
    const forbiddenNames: string[] = (schema as any).forbiddenPropertyNames;
    if (!forbiddenNames) return undefined;

    if (typeof instance !== 'object' || instance === null) return undefined;

    for (const prop of Object.keys(instance)) {
      if (forbiddenNames.includes(prop)) {
        return `the property name '${prop}' is reserved and cannot be reused`;
      }
    }

    return undefined;
  };

  v.addSchema(flagArgSchema, flagArgSchema.id);
  v.addSchema(stringArgSchema, stringArgSchema.id);
  v.addSchema(choiceArgSchema, choiceArgSchema.id);
  v.addSchema(argSchema, argSchema.id);
  v.addSchema(argsSchema, argsSchema.id);
  v.addSchema(commandSchema, commandSchema.id);
  v.addSchema(commandsSchema, commandsSchema.id);

  return v.validate(obj, sch, {
    nestedErrors: true
  } as Options);
};
