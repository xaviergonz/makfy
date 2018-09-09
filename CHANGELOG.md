# makfy changelog

## 1.4.0

- added run() as short syntax for argument-less / help-less commands. see README.md for further details.
- list is now the default when no option is used; to get help use --help
- fixed help command

## 1.3.0

- support for .ts files out of the box

## 1.2.0

- added support for commands/args/enum arg values with '-', '\_' and ':' characters
- 'fooBar' names are no longer automatically transformed to 'foo-bar' and vice-versa

## 1.1.11

- added utils.makfyContext to get info about the file makfy is running

## 1.1.10

- added a dependencies export that allows to require other commands and keep the cache in sync

## 1.1.9

- symlinks are now properly followed when using glob patterns

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
  - use `set x=y` on windows
  - use `export x=y` on unix
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
