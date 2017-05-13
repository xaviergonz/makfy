import { ExecContext } from './execRuntime';
export class MakfyError extends Error {
  execContext?: ExecContext;

  constructor(message: string, context: ExecContext | undefined) {
    super(message);
    Object.setPrototypeOf(this, MakfyError.prototype);
    this.name = this.constructor.name;
    this.execContext = context;
  }
}

export class RunError extends Error {
  execContext?: ExecContext;

  constructor(message: string, context: ExecContext | undefined) {
    super(message);
    Object.setPrototypeOf(this, RunError.prototype);
    this.name = this.constructor.name;
    this.execContext = context;
  }
}
