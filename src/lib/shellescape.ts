export type ShellType = 'sh' | 'cmd';

function _escapeShellSh(path: string) {
  if (!/^[A-Za-z0-9_\/-]+$/.test(path))
    return ("'" + path.replace(/'/g, "'\"'\"'") + "'").replace(/''/g, '');
  else
    return path;
}

function _escapeShellCmd(path: string) {
  if (!/^[A-Za-z0-9_\/-]+$/.test(path))
    return '"' + path.replace(/"/g, '""') + '"';
  else
    return path;
}

export const fixPath = (shell: ShellType, path: string) => {
  const oldSep = shell === 'sh' ? '\\' : '/';
  const newSep = shell === 'sh' ? '/' : '\\';

  const originalPath = path;
  path = path.trim();
  path = path.split(oldSep).join(newSep);
  if (process.platform === 'win32' && shell === 'sh') {
    // most probably mingw
    if (path.includes(':')) {
      if (path.length < 2 || path[1] !== ':' || path[2] !== '/') {
        throw new Error(`'${originalPath}' - path cannot be fixed`);
      }

      // from C:\... to /C/...
      path = `/${path[0]}${path.substr(2)}`;
    }
  }

  return path;
};

export function escapeShell(shell: ShellType, stringOrArray: string | string[]) {
  const escape = shell === 'cmd' ? _escapeShellCmd : _escapeShellSh;

  const ret: string[] = [];

  if (typeof(stringOrArray) === 'string') {
    return escape(stringOrArray);
  } else {
    stringOrArray.forEach((member) => {
      ret.push(escape(member));
    });
    return ret.join(' ');
  }
}
