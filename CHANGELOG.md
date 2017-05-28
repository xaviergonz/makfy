# makfy changelog

## 1.1.8
- fixed hanging on windows sometimes when the child process tries to access stdin

## 1.1.7
- added expandGlobs to utils
- made parallel execution have a limited concurrency for better performance

## 1.1.5
- added a setEnvVar method to utils
- added a FAQ with recommended CLI packages for usual operations

## 1.1.4
- added support for MINGW/cygwin (e.g. git-bash) on windows
- added fixPath to utils
- environment variables and current directory are now persisted under the same exec:
  - use ```set x=y``` on windows 
  - use ```export x=y``` on unix
  - if you want to persist it on different execs then do:
    ```js
    const a = await exec(...);
    await a.keepContext(...);
    ```

## 1.1.0

- breaking changes:
  - removed utils.filesChanged
  - added utils.getFileChangesAsync, a better approach to detect which files have changed
  - renamed utils.cleanCacheSync to utils.cleanCache

## 1.0.0

- first release
