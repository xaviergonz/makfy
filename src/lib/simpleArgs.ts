import { EnumArgDefinition, FlagArgDefinition, StringArgDefinition } from "./schema/args";

export function flag(): FlagArgDefinition {
  return {
    type: "flag"
  };
}

export function str(byDefault?: string): StringArgDefinition {
  return {
    type: "string",
    byDefault
  };
}

export function choice<V extends string = string>(
  values: V[],
  byDefault?: V
): EnumArgDefinition<V> {
  return {
    type: "enum",
    values,
    byDefault
  };
}
