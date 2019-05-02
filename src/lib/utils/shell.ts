import * as path from "path";
import * as shellescape from "./shellescape";

export const getShellType = (): shellescape.ShellType =>
  !process.env.SHELL && process.platform === "win32" ? "cmd" : "sh";

export const getPathEnvName = () => (getShellType() === "sh" ? "PATH" : "Path");

export const getPathDelimiter = () => path.delimiter;

export const getCwdName = () => (getShellType() === "sh" ? "pwd" : "cd");

export const getEnvName = () => (getShellType() === "sh" ? "printenv" : "set");

export const getChdirName = () => (getShellType() === "sh" ? "cd" : "cd /d");

export const escapeForShell = (stringOrArray: string | string[]) =>
  shellescape.escapeShell(getShellType(), stringOrArray);

export const fixPath = (pathname: string) => shellescape.fixPath(getShellType(), pathname);
