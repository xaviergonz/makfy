export class MakfyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ExecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
