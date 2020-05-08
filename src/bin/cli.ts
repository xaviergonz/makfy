#! /usr/bin/env node

import * as tsNode from "ts-node";
import * as yargs from "yargs";

yargs.parserConfiguration({
  "short-option-groups": false,
  "camel-case-expansion": false,
  "dot-notation": false,
  "parse-numbers": false,
  "boolean-negation": false,
  "duplicate-arguments-array": false,
  "flatten-duplicate-arrays": false,
});

// enable ts support
tsNode.register({
  pretty: true,
});

const argv = yargs.help(false).argv;

// invoke either the locally or the relative installed makfy, whichever is found first
// this fixes an issue where commands would not be found when both a local and global installation
// are present yet the global one is run

let cliMainModulePath = "./cliMain";

try {
  // try local, if not working we will try relative one instead
  cliMainModulePath = require.resolve("makfy/dist/bin/cliMain", {
    paths: [process.cwd()],
  });
} catch {
  // do nothing
}

// tslint:disable-next-line: no-submodule-imports
const globalOrLocalMainAsync: (argv: any) => Promise<void> = require(cliMainModulePath).mainAsync;

globalOrLocalMainAsync(argv).catch((err) => {
  throw err;
});
