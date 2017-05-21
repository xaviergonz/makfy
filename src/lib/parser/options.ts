import { MakfyError } from '../errors';
import { validateInstance } from '../schema';
import { FullOptions, optionsSchema, PartialOptions } from '../schema/options';
import { errorMessageForObject } from '../utils/formatting';

const defaultOptions: FullOptions = {
  profile: false,
  showTime: false,
};

export const parseOptions = (options: PartialOptions | undefined, skipValidation: boolean): FullOptions => {
  const fullOptions = { ...defaultOptions, ...options };

  if (!skipValidation) {
    const validationResult = validateInstance(fullOptions, optionsSchema);
    if (!validationResult.valid) {
      throw new MakfyError(errorMessageForObject(['options'], validationResult.toString()), undefined);
    }
  }

  return fullOptions;
};
