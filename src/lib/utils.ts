import * as fs from "fs";
import * as path from "path";
import { MakfyError } from "./errors";
import { ExecContext, GetFileChangesResult, MakfyContext } from "./schema/runtime";
import { unrollGlobPatternsAsync } from "./utils/globs";
import {
  cacheFolderName,
  createCacheFolder,
  generateHashCollectionAsync,
  getHashCollectionDelta,
  getHashCollectionFilename,
  loadHashCollectionFileAsync
} from "./utils/hash";
import { escapeForShell, getShellType } from "./utils/shell";
import * as shellescape from "./utils/shellescape";
import { isStringArray } from "./utils/typeChecking";

export interface UtilsContext {
  baseContext: ExecContext;
  warnAsync: (msg: string) => Promise<void>;
  infoAsync: (msg: string) => Promise<void>;
}

let utilsContext!: UtilsContext;
export function setUtilsContext(ctx: UtilsContext) {
  utilsContext = ctx;
}
export function getUtilsContext(): UtilsContext {
  return utilsContext;
}

function getBaseContext() {
  if (!utilsContext || !utilsContext.baseContext) {
    throw new MakfyError(`must be run inside a command`, undefined);
  }
  return utilsContext.baseContext;
}

export function getMakfyContext(): MakfyContext {
  const baseContext = getBaseContext();

  return Object.freeze({
    commandName: baseContext.commandName,
    commandArgs: baseContext.commandArgs,
    commands: baseContext.commands,
    options: baseContext.options,
    makfyFilename: baseContext.makfyFilename
  });
}

export function escape(...parts: string[]): string {
  return escapeForShell([...parts]);
}

export function fixPath(
  pathname: string,
  style: "autodetect" | "windows" | "posix" = "autodetect"
): string {
  let sh: shellescape.ShellType;
  switch (style) {
    case undefined:
    case "autodetect":
      sh = getShellType();
      break;
    case "windows":
      sh = "cmd";
      break;
    case "posix":
      sh = "sh";
      break;
    default:
      throw new MakfyError(`invalid fixPath style - '${style}'`, undefined);
  }
  return shellescape.fixPath(sh, pathname);
}

export function setEnvVar(name: string, value: string | undefined): string {
  const shell = getShellType();
  switch (shell) {
    case "sh":
      if (value === undefined) {
        return `unset ${name}`;
      } else {
        return `export ${name}=${escapeForShell(value)}`;
      }
    case "cmd":
      return `set ${name}=${value === undefined ? "" : value}`;
    default:
      throw new MakfyError(`unknown shell type - '${shell}'`, undefined);
  }
}

export async function expandGlobsAsync(globPatterns: string[]): Promise<string[]> {
  return unrollGlobPatternsAsync(globPatterns);
}

export interface GetFileChangesOptions {
  log: boolean;
}

export async function getFileChangesAsync(
  contextName: string,
  globPatterns: string[] | string,
  options?: Partial<GetFileChangesOptions>
): Promise<GetFileChangesResult> {
  const baseContext = getBaseContext();
  const { infoAsync } = utilsContext;

  if (typeof contextName !== "string") {
    throw new MakfyError(`'contextName' argument must be a string`, baseContext);
  }
  if (typeof contextName !== "string" && !isStringArray(globPatterns)) {
    throw new MakfyError(
      `'globPatterns' argument must be a string or an array of strings`,
      baseContext
    );
  }

  options = {
    log: true,
    ...options
  };
  if (contextName === undefined) {
    contextName = "";
  }

  const logChangesAsync = async (fileDeltas: GetFileChangesResult) => {
    if (options!.log) {
      if (!fileDeltas.hasChanges) {
        await infoAsync(`[${contextName}] no files changed`);
      } else if (fileDeltas.cleanRun) {
        await infoAsync(
          `[${contextName}] files changed: clean run - assuming all (${
            fileDeltas.added.length
          } files)`
        );
      } else {
        await infoAsync(
          `[${contextName}] files changed: ${fileDeltas.unmodified.length} unmodified, ${
            fileDeltas.modified.length
          } modified, ${fileDeltas.removed.length} removed, ${fileDeltas.added.length} added`
        );
      }
    }
  };

  // try to get a cached result first
  const hashFilename = getHashCollectionFilename(
    baseContext.makfyFileContents || baseContext.makfyFilename,
    contextName,
    "sha1"
  );
  if (baseContext.getFileChangesResults[hashFilename]) {
    const cachedResult = baseContext.getFileChangesResults[hashFilename];
    await logChangesAsync(cachedResult.result);
    return cachedResult.result;
  }

  if (typeof globPatterns === "string") {
    globPatterns = [globPatterns];
  }

  globPatterns = globPatterns.map((e) => e.trim()).filter((e) => e.length > 0);

  let files: string[] = [];
  if (globPatterns.length > 0) {
    // unroll glob patterns
    files = await unrollGlobPatternsAsync(globPatterns);
  }

  createCacheFolder();

  let oldHashCollection;
  //noinspection EmptyCatchBlockJS
  try {
    oldHashCollection = await loadHashCollectionFileAsync(hashFilename);
  } catch (err) {
    // do nothing
  }

  const newHashCollection = await generateHashCollectionAsync(files, "sha1", false);

  const delta = getHashCollectionDelta(oldHashCollection, newHashCollection);

  const cached = {
    result: delta,
    newHashCollection: newHashCollection,
    oldHashCollection: oldHashCollection
  };

  await logChangesAsync(delta);

  baseContext.getFileChangesResults[hashFilename] = cached;

  return delta;
}

export function cleanCache() {
  const deleteFolderRecursive = (dir: string) => {
    if (!fs.existsSync(dir)) {
      return;
    }

    fs.readdirSync(dir).forEach((file) => {
      const curPath = path.join(dir, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // recurse
        deleteFolderRecursive(curPath);
      } else {
        // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dir);
  };

  const cf = path.join(".", cacheFolderName);
  deleteFolderRecursive(cf);
}
