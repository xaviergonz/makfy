import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { GetFileChangesResult } from '../schema/runtime';

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
    stream.once('error', (err: Error) => {
      reject(err);
    });

    stream.on('data', (data: Buffer) => {
      hash.update(data);
    });

    stream.once('end', () => {
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
 * Gets a delta between two hash collections.
 * @param oldHashCollection
 * @param newHashCollection
 * @return {Promise<GetFileChangesResult>}
 */
export const getHashCollectionDelta = (oldHashCollection: HashCollection | undefined, newHashCollection: HashCollection): GetFileChangesResult => {
  const result: GetFileChangesResult = {
    hasChanges: false,
    cleanRun: false,
    removed: [],
    modified: [],
    unmodified: [],
    added: []
  };

  if (oldHashCollection === undefined) {
    result.hasChanges = true;
    result.cleanRun = true;
    result.added = Object.keys(newHashCollection.hashes);
    return result;
  }

  if (oldHashCollection.hashType !== newHashCollection.hashType) {
    throw new Error('hash type mistmatch');
  }

  const oldHashes = oldHashCollection.hashes;
  const newHashes = newHashCollection.hashes;

  const union = new Set<string>([...Object.keys(oldHashes), ...Object.keys(newHashes)]);
  for (const e of union) {
    const oldHash = oldHashes[e];
    const newHash = newHashes[e];
    if (oldHash && newHash) {
      if (oldHash.size === newHash.size && oldHash.hash === newHash.hash) {
        result.unmodified.push(e);
      }
      else {
        result.hasChanges = true;
        result.modified.push(e);
      }
    }
    else if (oldHash) {
      result.hasChanges = true;
      result.removed.push(e);
    }
    else if (newHash) {
      result.hasChanges = true;
      result.added.push(e);
    }
    else {
      throw new Error('no old and no new hash, this should not happen');
    }
  }

  return result;
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

export const getHashCollectionFilename = (scriptContents: string, contextName: string, hashType: HashType) => {
  const hash = crypto.createHash(hashType).update(scriptContents + contextName + hashType).digest('hex');

  return path.join(cacheFolderName, `${hash}.hash`);
};

export const createCacheFolder = () => {
  if (!fs.existsSync(cacheFolderName)) {
    fs.mkdirSync(cacheFolderName);
  }
};
