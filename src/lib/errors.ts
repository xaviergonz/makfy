export class MakfyError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, MakfyError.prototype);
    this.name = this.constructor.name;
  }
}

export class ExecError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ExecError.prototype);
    this.name = this.constructor.name;
  }
}
