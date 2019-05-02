import { Commands } from "./schema/commands";
import { FullOptions } from "./schema/options";

export const config: {
  commands: Commands;
  dependencies?: string[];
  options: FullOptions;
} = {
  commands: {},
  options: {
    profile: false,
    showTime: false
  }
};
