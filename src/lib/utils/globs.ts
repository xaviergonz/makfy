const glob = require('glob');

export const unrollGlobPatternAsync = async (globPattern: string): Promise<string[]> => {
  return await new Promise<string[]>((resolve, reject) => {
    glob(globPattern, { strict: true, nodir: true }, (err: Error | null, files: string[]) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(files);
    });

  });
};

export const unrollGlobPatternsAsync = async (globPatterns: string[]): Promise<string[]>  => {
  if (!Array.isArray(globPatterns)) {
    throw new Error('glob patterns must be a string array');
  }

  const set = new Set();
  for (let globPattern of globPatterns) {
    if (typeof globPattern !== 'string') {
      throw new Error('a glob pattern must be a string');
    }
    globPattern = globPattern.trim();
    const negative = globPattern.startsWith('!!');
    if (negative) {
      globPattern = globPattern.substr(2);
      globPattern = globPattern.trim();
    }

    if (globPattern.length === 0) {
      throw new Error('a glob pattern must not be empty');
    }

    const files = await unrollGlobPatternAsync(globPattern);
    for (const file of files) {
      if (negative) {
        set.delete(file);
      }
      else {
        set.add(file);
      }
    }
  }
  return [...set];
};
