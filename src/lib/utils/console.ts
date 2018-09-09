import chalk from "chalk";
import { socketFlushWriteAsync } from "./sockets";

export const resetColors = () => {
  const reset = chalk.reset("");
  process.stdout.write(reset);
  process.stderr.write(reset);
};

export const blockingConsoleLog = async (str: string = "") => {
  await socketFlushWriteAsync(process.stdout, str);
};

export const blockingConsoleError = async (str: string = "") => {
  await socketFlushWriteAsync(process.stderr, str);
};
