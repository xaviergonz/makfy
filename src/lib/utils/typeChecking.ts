export const isObject = (obj: any) => {
  return obj !== null && typeof obj === "object";
};

export const isFunction = (func: any) => {
  return typeof func === "function";
};

export const isStringArray = (arr: any) => {
  if (!Array.isArray(arr)) {
    return false;
  }
  for (const e of arr) {
    if (typeof e !== "string") {
      return false;
    }
  }
  return true;
};
