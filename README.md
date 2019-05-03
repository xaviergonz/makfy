<p align="center">
  <img src="https://cloud.githubusercontent.com/assets/6306796/26037402/2d80aa16-38f2-11e7-8bba-72e956921eb2.png">
  <p align="center">npm scripts on steroids!</p>
</p>

[![npm version](https://badge.fury.io/js/makfy.svg)](https://badge.fury.io/js/makfy)

Install it globally

`npm install -g makfy` / `yarn global add makfy`  

or locally

`npm install --save-dev makfy` / `yarn add --dev makfy`

**To support this project star it on [github](https://github.com/xaviergonz/makfy)!**

## What is makfy?

makfy is an evolution of npm-scripts to help you automate time-consuming tasks in your development workflow.

## Why makfy?

Build systems should be simple, and that's why we guess npm scripts are gaining traction lately.  
makfy tries to follow that KISS philosophy while adapting gracefully to complex build requirements.

#### What does it inherit from npm scripts?

- It is still **shell-based** in its core.

- The gazillion CLI tools available in npm (_browserify, rimraf, webpack..._) are still available for you to use.  
  In other words, if there's a CLI version of it available nothing else is needed to use it with makfy.

#### What does it add?

- **Javascript/Typescript powered**  
  `makfyfile.(js|ts)` is a javascript/typescript file, so you can use it to decide how the shell commands should run or when.

- **Easy argument definition**  
  It is easy to create command line arguments for each command, plus validation is made automatically.

- **Command line help auto-generation**  
  So you don't have to dig into config files to know what each command does.

- **Concurrency made easy**  
  Thanks to async/await plus some nifty tricks (and concurrent logs look good!).

- **Utils included, such as a smart cache!**  
  For example it includes a file checker so shell commands are not run twice if not needed, or only run on the files that changed.

- **Strong validation of `makfyfile.js` files**  
  You should not be left wondering if you mistyped something.

- **Colorized detailed logs**  
  So it is easy to spot where your build is currently at and/or where it failed.

## Sample `makfyfile.(js|ts)` files

A simple example (run with `makfy clean`).

**Note:** To use the async/await syntax you must install **node 7.6+** or use a typescript file; if you can't then you can either use promises (though the syntax won't be as nice) or babelize compile the `makfyfile.js` file before.

```ts
import { cmd } from "makfy";
// or
const { cmd } = require("makfy");

cmd("clean")
  .run(async (exec) => {
    await exec(
      // running sequentially
      "rimraf ./dist-a",
      "rimraf ./dist-b",
      // and these run after the other ones too, but in parallel!
      ["rimraf ./dist-c", "rimraf ./dist-d"]
    );
  });
```

Another one but with arguments and help (run with `makfy clean --dev`, `makfy clean --prod` or `makfy clean --dev --prod`).

```ts
import { cmd, flag } from "makfy";
// or
const { cmd } = require("makfy");

cmd("clean")
  .desc("clean the project")
  .args({
    prod: flag(),
    dev: flag()
  })
  .argsDesc({
    prod: "production clean",
    dev: "dev clean"
  })
  .run(async (exec, {prod, dev}) => {
    await exec(
      prod ? "rimraf ./dist-prod" : null,
      dev ? "rimraf ./dist-dev" : null
    );
  });
```

The help we will get when running `makfy --list` or `makfy`.

```
using command file 'makfyfile.js'...
listing all commands...

clean [--dev] [--prod]
 - clean the project
   [--dev]     dev clean (default: false)
   [--prod]    production clean (default: false)
```

Running commands inside commands (`makfy build`).

```ts
import { cmd } from "makfy";
// or
const { cmd } = require("makfy");

cmd("build")
  .run(async (exec) => {
    await exec(
      "@clean",
      { _: "clean" }, // same as above
      ... // whatever commands go next
    );
  });

// shorter version
cmd("build")
  .run(
    "@clean",
    { _: 'clean' }, // same as above
    ... // whatever commands go next
  );

cmd("clean")...
```

Running commands inside commands and sending them arguments.

```ts
import { cmd } from "makfy";
// or
const { cmd } = require("makfy");

cmd("build")
  .run(async (exec) => {
    await exec(
      "@clean --dev --prod",
      { _: "clean", args: { dev: true, prod: true }}, // same as above
      ... // whatever commands go next
    );
  });

// shorter version
cmd("build")
  .run(
    "@clean --dev --prod",
    { _: "clean", args: { dev: true, prod: true }}, // same as above
    ... // whatever commands go next
  );

cmd("clean")...
```

_Pro-tip!_  
Running the typescript compiler, but only if the sources did not change - this reduces build times tremendously!

```ts
import { cmd, getFileChanges } from "makfy";
// or
const { cmd, getFileChanges } = require("makfy");

cmd("compile")
  .run(async (exec) => {
    const delta = await getFileChanges("typescript", ["./src/**/*.ts", "./src/**/*.tsx"]);

    if (delta.hasChanges) {
      await exec(
        // here you would remove all target files generated by this step
        // then compile new target files
        "tsc -p ."
        // additionally you could even only run the compiler over delta.added + delta.modified files
      );
    }
  });
```

### `cmd` short syntax

If your command doesn't need any to access any arguments then you can use the `cmd("commandName").run(...commands)` function to make it shorter to write:

```ts
import { cmd } from "makfy";
// or
const { cmd } = require("makfy");

cmd("clean")
  .desc("cleans stuff")
  .run(
    // running sequentially
   "rimraf ./dist-a",
   "rimraf ./dist-b",
    // and these run after the other ones too, but in parallel!
    ["rimraf ./dist-c", "rimraf ./dist-d"]
  );
```

## Documentation

The basic structure of a `makfyfile.(js|ts)` is as follows:

```ts
import { cmd, setDependencies, setOptions, flag, choice, str } from "makfy";
// or
const { cmd, setDepenencies, setOptions, flag, choice, str } = require("makfy");

cmd("commandName")
  .desc?("command description")
  .args?({
    [argName]:
      | flag()
      | choice(["option1", "option2", "default"?])
      | str("default"?)
  })
  .argsDesc?({
    [argName]: "arg description"
  })
  // one of these two
  .run(async (exec, args) => {...})
  .run("cmd1", "cmd2", ...)

// optionally...
setDependencies(string[] | undefined);
setOptions(Options);
```

In more detail:

#### `cmd(commandName)`

  Adds a command to the list of possible commands. If `commandName` starts with `_` then it will be
  considered an internal command that cannot be invoked/listed using the CLI, yet can be run by other
  commands.

- **`.run(async (exec, args) => Promise<void>)`**

  > An async function that takes three arguments, `exec` and `args`.
  >
  > - **`exec: async(...commands: ExecCommand[]) => Promise<void>`**
  >
  >   > A function that allows you to run `ExecCommand`(s) sequentially, which can be:
  >   >
  >   > - **shell string (e.g. `'npm install'`) - `string`**
  >   >
  >   >   > It will run the given command in the shell.
  >   >   >
  >   >   > If the string starts with `%` then stdout will be silenced,
  >   >   > if it starts with `%%` then both stdout and the log of the command itself will be silenced.
  >   >   >
  >   >   > Note that stderr is never silenced, so errors/warnings will always be shown.
  >   >
  >   > - **help string (e.g. `'? installing packages'`) - `string`**
  >   >
  >   >   > It will print that help to the console, useful to keep track of what your build is doing.
  >   >
  >   > - **command invocation object - `{ _: 'commandName', args?: object }`**
  >   >
  >   >   > It will run another command inside the current command, optionally passing it the given arguments if desired.
  >   >   >
  >   >   > A simpler way to invoke sub-commands is using the string `'@commandName ...args'` as if it was invoked from the shell.
  >   >   >
  >   >   > Note that the arguments are validated automatically for you as they would if they were coming from the command line directly.
  >   >
  >   > - **exec-command array (e.g. `[ 'npm install', '@clean' ]`) - `ExecCommand[]`**
  >   >   > It will run whatever is inside but in parallel instead of sequentially. If an array is used inside another array then it will go back to run sequentially.
  >   >   >
  >   >   > This should allow you to create complex sequential/parallel executions such as:
  >   >   >
  >   >   > ```js
  >   >   > await exec(
  >   >   >   a,
  >   >   >   [b, c], // once a is done then runs in parallel b+c
  >   >   >   // once a, b+c are done then runs (e,f) in parallel with (g,h)
  >   >   >   [[e, f], [g, h]],
  >   >   >   i // once a, b+c, (e,f)+(g+h) are done then runs i
  >   >   > );
  >   >   > ```
  >   >   >
  >   >   > Of course even more complex scenarios are supported since `exec(...)` basically returns an awaitable Promise.
  >
  > - **`args: object`**
  >
  >   > An object where each property is the argument value as coming from the command line or exec sub-command invocation.

- **`.run(...commands: ExecCommand[])`**

  > Short syntax to run an argument-less command.

- **`.desc?(string)`**

  > An optional description that defines what the command does so it is shown when using `makfy --list`.

- **`.args?({ [argName]: ArgDefinition })`**

  > An optional object of argument definitions that can be passed to that command using `makfy commandName ...args` and that will be automatically validated.
  >
  > An `ArgDefinition` can be:
  >
  > - **Flag option - `flag()`**
  >
  >   > An optional flag, false by default unless you use `--argName`
  >
  > - **String option - `str(byDefault?: string)`**
  >
  >   > A string option, required if no `byDefault` is given (`--argName=string`, use quotes if it has to have spaces)
  >
  > - **Choice (AKA enum) option - `choice(values: string[], byDefault?: string })`**
  >
  >   > An choice (enum) option where only `values` are valid, required if no `byDefault` is given (`--argName=string`)

- **`.argsDesc?({ [argName]: string })`**

  > An optional object of argument descriptions that will be shown as help when using `makfy --list`.

### `setDependencies(string[] | undefined)`

`setDependencies` is only ever needed if you use the `getFilesChangedAsync()` utility method, since it is
used to determine when it a clean run is triggered.
As a rule of thumb, if you do a local require such as `require('./foo/bar')` in your
`makfyfile.js` you should also export `dependencies: [ './foo/bar' ]`, but **not** any global requires.

### `setOptions({profile?, showTime?})`

`setOptions` takes an optional object that can be exported to set the default of some options:

- `profile: boolean`

  > When set it will log how much each shell command takes (default: `false`)

- `showTime: boolean`

  > When set it will show the current time near each log line (default: `false`)

### Utility methods (imported from makfy package)

- `escape(...parts: string[]): string`

  > Escapes all parts of a given shell command.
  > For example, `escape('hello', 'to this world')` will return `hello "to this world"` under a cmd shell and `hello 'to this world'` under other shells .

- `fixPath(path: string, style: 'autodetect' | 'windows' | 'posix'): string`

  > Fixes a path so it is valid under a given OS, by swapping `/` and `\` if needed, plus converting `c:\...` to `/c/...` in mingw in windows.
  > The optional style argument forces the result to be valid in windows or posix (default: `'autodetect'`).

- `setEnvVar(name: string, value: string | undefined): string`

  > Returns a command string that can be used inside `exec` to set/clear an environment variable.
  > For example, `setEnvVar('NODE_ENV', 'development)` will return `'set NODE_ENV=development'` under a cmd shell and `'export NODE_ENV=development'` under other shells.

- `async expandGlobsAsync(globPatterns: string[]): Promise<string[]>`

  > Expand one or more glob patterns into and array of single files. Note that if the glob pattern starts with `'!!'` then matched files will be removed from previous glob pattern results rather than added.
  > For example, to match all json files except for package.json files pass `[ './**/*.json', '!!./**/package.json' ]`.

- `async getFileChangesAsync(contextName: string, globPatterns: string[] | string, options: { log = true }): Promise<GetFileChangesResult>`

  > Returns an object which includes the changes to the given files (given a certain context) since the last successful run.
  > If there was no previous successful run (or the cache was cleared) then it is considered a clean run.
  >
  > ```js
  > {
  >   hasChanges: boolean,  // true if there are any changes or it is a clean run
  >   cleanRun: boolean,    // true if it is a clean run (no previous version to compare against was available)
  >   added: string[],      // files created since the last successful run (this is the only array with contents if it is a clean run)
  >   removed: string[],    // files deleted since the last successful run
  >   modified: string[],   // files modified since the last successful run
  >   unmodified: string[]  // files not modified since the last successful run
  > }
  > ```
  >
  > Useful for example if you don't want to rerun the babel if none of the sources changed.
  >
  > The single option avaible is `log` to log the cache verification result (default: `true`).
  >
  > **Notes:**
  >
  > - If you generate two different targets based on the same source files (for example a production vs a debug bundle) make sure to use different context names for each one.
  > - This function will create files inside a `.makfy-cache` folder at the end of every successful run.
  > - If you change the `makfyfile.js` contents then a clean run will be assumed. This is done so you don't have to manually clean the cache folder every time you make changes to it.
  >   If you require other custom (made by you) scripts you should add them to the dependencies array to ensure you get proper cache invalidation when you change those as well.

- `cleanCache(): void`

  > Cleans the `.makfy-cache` folder. Use it if you want to make sure all next calls to `getFileChangesAsync` work as if it was a clean run.

- `makfyContext: object`
  > An object with the makfy context, this is, how the makfy file was run. Its contents are:
  >
  > ```js
  > {
  >   // main command name (e.g. the command that was run from the command line)
  >   commandName: string;
  >
  >   // main command args and their computed values
  >   commandArgs: object;
  >
  >   // commands object as exported from the makfyfile
  >   commands: Commands;
  >
  >   // options object with default values already filled in if missing from the exports
  >   // includes a colorMode boolean to know if makfy is running in color mode or not
  >   options: Options & { colorMode: boolean };
  >
  >   // makfyfile filename as specified by the -f argument (defaults to makfyfile.js)
  >   // hint: to get the absolute path use path.resolve(makfyFilename)
  >   makfyFilename: string;
  > }
  > ```
  >
  > **Do not modify this object**

## FAQ

##### Recommended CLI packages for cross-platform commands

- _Set/unset an environment variable:_ Just invoke `setEnvVar` inside an `exec` call. Alternatively use [cross-env](https://www.npmjs.com/package/cross-env).
- _Delete files/directories:_ [rimraf](https://www.npmjs.com/package/rimraf)
- _Copy files/directories:_ [ncp](https://www.npmjs.com/package/ncp)
- _Create a directory:_ [mkdirp](https://www.npmjs.com/package/mkdirp)

##### Keeping the context between `exec` executions

Executions inside a very same `exec` call keep track of changes to the current working directory and environment variables.

If you wish to keep the context between different `exec` executions you can do so like this:

```js
const a = await exec(...);
await a.keepContext(...);
```

**Note:** In unix style shells you need to export the variable for it to be tracked (e.g. `export NODE_ENV=production`). Consider using `setEnvVar`, which does this for you.
