import { MakfyError } from './errors';
import { errorMessageForObject } from './utils';
import { optionsSchema, validateInstance } from './schema';

export interface Options {
  profile?: boolean;
}

const defaultOptions: Partial<Options> = {
  profile: false
};

export const parseOptions = (options: Options | undefined, skipValidation: boolean) => {
  const fullOptions = { ...defaultOptions, ...options };

  if (!skipValidation) {
    const validationResult = validateInstance(fullOptions, optionsSchema);
    if (!validationResult.valid) {
      throw new MakfyError(errorMessageForObject(['options'], validationResult.toString()));
    }
  }

  return fullOptions;
};
