import { Schema } from "jsonschema";

export interface FullOptions {
  profile: boolean;
  showTime: boolean;
}

export type PartialOptions = Partial<FullOptions>;

export const optionsSchema: Schema = {
  id: "/options",
  type: "object",
  required: [],
  properties: {
    profile: {
      type: "boolean"
    },
    showTime: {
      type: "boolean"
    }
  },
  additionalProperties: false
};
