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

export function choice(values: string[], byDefault?: string): EnumArgDefinition {
  return {
    type: "enum",
    values,
    byDefault
  };
}
