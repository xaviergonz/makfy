import { choice, cmd } from "./src/lib/index";

cmd("test")
  .desc("abc")
  .args({
    arg: choice(["a", "b", "c"], "a")
  })
  .run(async (exec, args) => {
    args.arg; // "a" | "b" | "c", used to be string
  });
