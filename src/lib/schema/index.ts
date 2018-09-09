// tslint:disable:no-object-literal-type-assertion

import { Options, Schema, SchemaContext, Validator, ValidatorResult } from "jsonschema";

// export const alphanumericPattern = '^[a-zA-Z0-9]+$';
export const alphanumericExtendedPattern = "^[a-zA-Z0-9][-:_a-zA-Z0-9]*$";

export const validateInstance = (obj: any, sch: Schema): ValidatorResult => {
  const v = new Validator();

  (v.attributes as any).isFunction = (instance: any, schema: Schema) => {
    if (!(schema as any).isFunction) {
      return;
    }

    if (typeof instance !== "function") {
      return "must be a function";
    }
    return undefined;
  };

  (v.attributes as any).matchesValues = (
    instance: any,
    schema: Schema,
    options: Options,
    ctx: SchemaContext
  ) => {
    if (!(schema as any).matchesValues) {
      return;
    }

    if (instance === undefined) {
      return undefined;
    }
    const path = ctx.propertyPath.split(".");
    const command = path[1];
    const arg = path[3];
    const values = obj[command].args[arg].values;
    if (!Array.isArray(values)) {
      return undefined;
    }

    if (typeof instance !== "string") {
      return "must be a string";
    }
    if (!values.includes(instance)) {
      return `must be one of: ${values.join(", ")}`;
    }

    return undefined;
  };

  (v.attributes as any).forbiddenPropertyNames = (instance: any, schema: Schema) => {
    const forbiddenNames: string[] = (schema as any).forbiddenPropertyNames;
    if (!forbiddenNames) {
      return undefined;
    }

    if (typeof instance !== "object" || instance === null) {
      return undefined;
    }

    for (const prop of Object.keys(instance)) {
      if (forbiddenNames.includes(prop)) {
        return `the property name '${prop}' is reserved and cannot be reused`;
      }
    }

    return undefined;
  };

  return v.validate(obj, sch, {
    nestedErrors: true
  } as Options);
};
