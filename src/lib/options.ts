import { generateDefaultValues, validateValues, Schema } from './validation';
import { MakfyError } from './errors';

export interface Options {
  profiling?: boolean;
}

const validOptionsSchema: Schema = {
  profiling: {
    type: 'boolean',
    defaultValue: false
  }
};

const defaultOptions = generateDefaultValues(validOptionsSchema);

export const parseOptions = (options?: Options) => {
  const fullOptions = { ...defaultOptions, ...options };

  const validationResult = validateValues(validOptionsSchema, fullOptions, true, false);
  if (validationResult) {
    throw new MakfyError(`'options' object - ${validationResult}`);
  }

  return fullOptions;
};
