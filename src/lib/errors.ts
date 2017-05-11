export class MakfyError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, MakfyError.prototype);
    this.name = this.constructor.name;
  }
}

export class RunError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, RunError.prototype);
    this.name = this.constructor.name;
  }
}
