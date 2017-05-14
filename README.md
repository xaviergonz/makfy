# makfy
*npm scripts on steroids!*

[![npm version](https://badge.fury.io/js/makfy.svg)](https://badge.fury.io/js/makfy)


Install it globally ```npm install -g makfy``` or locally ```npm install --save-dev makfy``` 

## What is makfy?

makfy is an evolution of npm-scripts to help you automate time-consuming tasks in your development workflow.

## Why makfy?
Build systems should be simple, and that's why we guess npm scripts are gaining traction lately.  
makfy tries to follow that KISS philosophy while adapting gracefully to complex build requirements.
  
#### What does it inherit from npm scripts?

* It is still **shell-based** in its core.

* The gazillion CLI tools available in npm (*browserify, rimraf, webpack...*) are still available for you to use.    
  In other words, if there's a CLI version of it available nothing else is needed to use it with makfy.

#### What does it add?
* **Javascript powered**  
  The config file is a javascript file, so you can use it to decide how the shell commands should run or when.
  
* **Easy argument definition**  
  It is easy to create command line arguments for each command, plus validation is made automatically.
  
* **Command line help auto-generation**  
  So you don't have to dig into the config file to know what each command does.

* **Concurrency made easy**  
  Thanks to async/await plus some nifty tricks (and concurrent logs look good!).
  
* **Utils included**  
  Such as a source file checker so shell commands are not run twice is not needed.
  
* **Strong validation of config files**  
  You should not be left wondering if you mistyped something.
  
* **Colorized detailed logs**  
  So it is easy to spot where your build is currently at and/or where it failed.


## Samples

A simple example 'makfyfile.js' (run with ```makfy clean```).

**Note:** To use the async/await syntax you must install **node 7.6+**; if you can't then you can either use promises (though the syntax won't be as nice) or babelize/typescript compile the config file.

```js
module.exports = {
  commands: {
    clean: {
      run: async(exec) => {
        await exec(
          // running sequentially
          'rimraf ./dist-a',
          'rimraf ./dist-b',
          // and these run after the other ones too, but in parallel!
          [ 'rimraf ./dist-c', 'rimraf ./dist-d' ]
        );
      }
    }
  }  
};
```

Another one but with arguments and help (run with ```makfy clean --dev```, ```makfy clean --prod``` or ```makfy clean --dev --prod```).
```js
module.exports = {
  commands: {
    clean: {
      desc: 'clean the project',
      args: {
        prod: { type: 'flag', desc: 'production clean' },
        dev: { type: 'flag', desc: 'dev clean' }
      },
      run: async(exec, args) => {
        await exec(
          args.prod ? 'rimraf ./dist-prod' : null,
          args.dev ? 'rimraf ./dist-dev' : null
        );
      }
    }
  }  
};
```

The help we will get when running ```makfy --list```.
```
using command file 'makfyfile.js'...
listing all commands...

clean [--dev] [--prod]
 - clean the project
   [--dev]     dev clean (default: false)
   [--prod]    production clean (default: false)

```

Running commands inside commands (```makfy build```).
```js
module.exports = {
  commands: {
    build: {
      run: async(exec) => {
        await exec(
            '@clean',
            ... // whatever commands go next
        );        
      }
    }
    clean: {
      ...
    }
  }  
};
```

Running commands inside commands and sending them arguments.
```js
module.exports = {
  commands: {
    build: {
      run: async(exec) => {
        await exec(
            { _: 'clean', args: { dev: true, prod: true }}
            ... // whatever commands go next
        );        
      }
    }
    clean: {
      ...
    }
  }  
};
```

*Pro-tip!*  
Running the typescript compiler, but only if the sources did not change - this reduces build times tremendously!
```js
module.exports = {
  commands: {
    compile: {
      run: async(exec, args, utils) => {
        if (await utils.filesChanged([
          './src/**/*.ts',
          './src/**/*.tsx'
        ])) {
          await exec('tsc -p .');
        };
      }
    }
  }  
};
```

## Documentation

The basic structure of a ```makfyfile.js``` is as follows:
```js
module.exports = {
  commands: {
    [commandName]: {
      run: async(exec, args, utils) => Promise<void>,
      desc?: string,
      args?: {
        [argName]: ArgDefinition
      }
    }   
  },
  options?: Options
};
```

In more detail:
### ```commands: { [commandName]: Command }```
```commands``` is an object with alphanumeric keys, which are the command names.
 
#### ```Command: { run, desc?, args? }```
  * ##### ```run: async(exec, args, utils) => Promise<void>```
    > An async function that takes three arguments, ```exec```, ```args``` and ```utils```.
    >    
    > * ###### ```exec: async(...commands: ExecCommand[]) => Promise<void>```
    >   > A function that allows you to run ```ExecCommand```(s) sequentially, which can be:
    >   >
    >   > * ###### shell string (e.g. ```'npm install'```) - ```string```       
    >   >   >  It will run the given command in the shell.
    >   >   >
    >   >   >  If the string starts with ```%``` then stdout will be silenced, 
    >   >   >  if it starts with ```%%``` then both stdout and the log of the command itself will be silenced.
    >   >   >
    >   >   >  Note that stderr is never silenced, so errors/warnings will always be shown.
    >   >
    >   > * ###### help string (e.g. ```'? installing packages'```) - ```string``` 
    >   >   > It will print that help to the console, useful to keep track of what your build is doing.
    >   >
    >   > * ###### command invocation object - ```{ _: 'commandName', args?: object }```
    >   >   > It will run another command inside the current command, optionally passing it the given arguments if desired.         
    >   >   >
    >   >   > A simpler way to invoke sub-commands (if arguments are not needed) is using the string ```'@commandName'```.
    >   >   >
    >   >   > Note that the arguments are validated automatically for you as they would if they were coming from the command line directly.
    >   >
    >   > * ###### exec-command array (e.g. ```[ 'npm install', '@clean' ]```) - ```ExecCommand[]```
    >   >   >   It will run whatever is inside but in parallel instead of sequentially. If an array is used inside another array then it will go back to run sequentially.
    >   >   >  
    >   >   > This should allow you to create complex sequential/parallel executions such as:
    >   >   >    ```js
    >   >   >    await exec(
    >   >   >      a,
    >   >   >      [ b, c ], // once a is done then runs in parallel b+c
    >   >   >      // once a, b+c are done then runs (e,f) in parallel with (g,h)
    >   >   >      [
    >   >   >        [ e, f ],   
    >   >   >        [ g, h ]
    >   >   >      ],
    >   >   >      i // once a, b+c, (e,f)+(g+h) are done then runs i
    >   >   >    );
    >   >   >    ```
    >   >   >      
    >   >   >   Of course even more complex scenarios are supported since ```exec(...)``` basically returns an awaitable Promise.
    >
    > * ###### ```args: object```
    >   > An object where each property is the argument value as coming from the command line or exec sub-command invocation.
    >
    > * ###### ```utils: object```
    >   > An object with nifty util methods:
    >   > 
    >   >  * ###### ```filesChanged: async([gobPatterns: string[] | string], log = true) => Promise<boolean>```
    >   >    > Returns true if any of the files represented from the union of all gob pattern(s) changed. Useful for example if you don't need to rerun the babel if none of the sources changed.

   * #### ```desc?: string```
     > An optional property that defines what the command does so it is shown when using ```makfy --list```.
 
   * #### ```args?: { [argName]: ArgDefinition }```
     > An optional object of argument definitions that can be passed to that command using ```makfy commandName ...args``` and that will be automatically validated.
     > 
     > An ```ArgDefinition``` can be:
     > * ###### Flag option - ```{ type: 'flag' }```
     >
     >  > An optional flag, false by default unless you use ```--argName```
     >
     > * ###### String option - ```{ type: 'string', byDefault?: string }```
     >
     >  > A string option, required if no ```byDefault``` is given (```--argName=string```, use quotes if it has to have spaces)
     >
     > * ###### Enum option - ```{ type: 'enum', values: string[], byDefault?: string }```
     >
     >  > An enum option where only ```values``` are valid, required if no ```byDefault``` is given (```--argName=string```)
     >
     > All of them accept a ```desc?: string``` property in case you want to add a given help string to them.
   
   
 ### ```options: {profile?, showTime?}```
 ```options``` is an optional object that can be exported to set the default of some options:
 * ```profile: boolean```
 
   > When set it will log how much each shell command takes (default: ```false```)
 
 * ```showTime: boolean```
  
   > When set it will show the current time near each log line (default: ```false```)
