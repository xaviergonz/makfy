function _escapePathSh(path: string) {
  if (!/^[A-Za-z0-9_\/-]+$/.test(path))
    return ("'" + path.replace(/'/g, "'\"'\"'") + "'").replace(/''/g, '');
  else
    return path;
}

function _escapePathWin(path: string) {
  if (!/^[A-Za-z0-9_\/-]+$/.test(path))
    return '"' + path.replace(/"/g, '""') + '"';
  else
    return path;
}

export function escapePath(shell: 'cmd' | 'sh', stringOrArray: string | string[]) {
  const escape = shell === 'cmd' ? _escapePathWin : _escapePathSh;

  const ret: string[] = [];

  if (typeof(stringOrArray) === 'string') {
    return escape(stringOrArray);
  } else {
    stringOrArray.forEach(function(member) {
      ret.push(escape(member));
    });
    return ret.join(' ');
  }
}
