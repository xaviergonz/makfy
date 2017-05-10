import { isObject } from './utils';

export interface Schema {
  [key: string]: {
    type: 'boolean' | 'string' | 'any';
    defaultValue?: any; // if no default value is provided it is assumed to be required
  };
}

export const generateDefaultValues = (schema: Schema) => {
  const obj = {};
  Object.keys(schema).forEach((pname) => {
    obj[pname] = schema[pname].defaultValue;
  });
  return obj;
};

export const validateValues = (schema: Schema, values: object, checkMissing: boolean, allowExtra: boolean) => {
  if (!isObject(values)) {
    return `must be an object`;
  }

  // make sure all the properties are ok and of the correct type
  for (const pname of Object.keys(values)) {
    const schemaProperty = schema[pname];
    if (schemaProperty) {
      const type = schemaProperty.type;
      const value = values[pname];
      if (type !== 'any' && typeof value !== type) {
        return `invalid value for property '${pname}', a ${type} was expected`;
      }
    }
    else {
      if (!allowExtra) {
        return `unknown property: '${pname}' - valid properties are: ${Object.keys(schema).join(', ')}`;
      }
    }
  }

  if (checkMissing) {
    for (const pname of Object.keys(schema)) {
      const schemaProperty = schema[pname];
      if (schemaProperty.defaultValue === undefined) {
        if (values[pname] === undefined) {
          return `property '${pname}' is required but missing`;
        }
      }
    }
  }

  return undefined;
};
