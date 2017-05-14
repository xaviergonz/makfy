import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type HashType = 'sha1';

export interface HashEntry {
  hash?: string;
  size: number;
}

export interface Hashes {
  [path: string]: HashEntry;
}

export interface HashCollection {
  hashType: HashType;
  hashes: Hashes;
}

export const cacheFolderName = '.makfy-cache';

export const generateHashEntryAsync = async (filePath: string, hashType: HashType, onlySize: boolean): Promise<HashEntry> => {
  const stat = fs.statSync(filePath);
  const size = stat.size;

  if (onlySize) {
    return {
      size: size
    };
  }

  const hash = crypto.createHash(hashType);
  const stream = fs.createReadStream(filePath);

  return await new Promise<HashEntry>((resolve, reject) => {
    stream.on('error', (err: Error) => {
      reject(err);
    });

    stream.on('data', (data: Buffer) => {
      hash.update(data);
    });

    stream.on('end', () => {
      const hashEntry: HashEntry = {
        hash: hash.digest('base64'),
        size: size,
      };

      resolve(hashEntry);
    });
  });
};

export const generateHashCollectionAsync = async (files: string[], hashType: HashType, onlySize: boolean): Promise<HashCollection> => {
  const hashes = {};

  for (const file of files) {
    hashes[file] = await generateHashEntryAsync(file, hashType, onlySize);
  }

  return {
    hashType: hashType,
    hashes: hashes
  };
};

/**
 * If the hash matches it will return undefined, else it will return the new hash collection.
 * @param oldHashCollection
 * @param files
 * @param hashType
 * @return {Promise<HashCollection | undefined>}
 */
export const checkHashCollectionMatchesAsync = async (oldHashCollection: HashCollection | undefined, files: string[], hashType: HashType): Promise<HashCollection | undefined> => {
  const genHash = async (onlySize: boolean) => {
    return await generateHashCollectionAsync(files, hashType, onlySize);
  };

  // no previous hash collection
  if (
    !oldHashCollection || // no previous hash collection
    hashType !== oldHashCollection.hashType || // different hash type
    files.length !== Object.keys(oldHashCollection.hashes).length // different number of files
  ) {
    return await genHash(false);
  }

  // all file paths must be the same
  const hashes = oldHashCollection.hashes;
  for (const fpath of files) {
    if (!hashes[fpath]) {
      return await genHash(false);
    }
  }

  // all sizes must be the same
  const sizesHash = await genHash(true);
  for (const fpath of files) {
    const hash1 = hashes[fpath];
    const hash2 = sizesHash.hashes[fpath];
    if (hash1.size !== hash2.size) {
      return await genHash(false);
    }
  }

  // all hashes must be the same
  const fullHash = await genHash(false);
  for (const fpath of files) {
    const hash1 = hashes[fpath];
    const hash2 = fullHash.hashes[fpath];
    if (hash1.size !== hash2.size || hash1.hash !== hash2.hash) {
      return fullHash;
    }
  }

  // matches
  return undefined;
};

/**
 * Tries to load a hash file.
 * @param hashFilePath Path to the hash file
 * @return {Promise<HashCollection>} The hash collection.
 */
export const loadHashCollectionFileAsync = async (hashFilePath: string): Promise<HashCollection> => {
  return await new Promise<HashCollection>((resolve, reject) => {
    fs.readFile(hashFilePath, 'utf-8', (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(JSON.parse(data));
    });
  });
};

export const saveHashCollectionFileAsync = async (hashFilePath: string, hashCollection: HashCollection) => {
  return await new Promise<void>((resolve, reject) => {
    fs.writeFile(hashFilePath, JSON.stringify(hashCollection), (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
};

export const getHashCollectionFilename = (scriptName: string, gobPatterns: string[], hashType: HashType) => {
  gobPatterns = gobPatterns.map((e) => e.trim()).filter((e) => e.length > 0);
  gobPatterns.sort();
  const json = JSON.stringify(gobPatterns);
  const hash = crypto.createHash(hashType).update(json).digest('hex');

  return path.join(cacheFolderName, `${scriptName}-${hash}.hash`);
};

export const createCacheFolder = () => {
  if (!fs.existsSync(cacheFolderName)) {
    fs.mkdirSync(cacheFolderName);
  }
};
