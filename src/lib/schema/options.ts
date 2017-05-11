import { Schema } from 'jsonschema';

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

