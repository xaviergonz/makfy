import * as colors from 'colors/safe';

export const resetColors = () => {
  const reset = colors.reset('');
  process.stdout.write(reset);
  process.stderr.write(reset);
};

export const isObject = (obj: any) => {
  return obj !== null && typeof obj === 'object';
};

export const isFunction = (func: any) => {
  return typeof func === 'function';
};

export const isAlphanumericString = (str: string, emptyIsValid = false) => {
  if (str.length <= 0) {
    return emptyIsValid;
  }
  return (/^[a-z0-9]+$/i.test(str));
};

export const isAlphanumericStringArray = (arr: any) => {
  if (!Array.isArray(arr)) {
    return false;
  }
  for (const e of arr) {
    if (!isAlphanumericString(e)) {
      return false;
    }
  }
  return true;
};

export const getTimeString = () => {
  return colors.gray(`[${new Date(new Date().getTime()).toLocaleTimeString()}] `);
};
