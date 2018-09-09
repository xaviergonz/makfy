export class TextWriter {
  output: string = "";

  write(str?: string) {
    this.output += str ? str : "";
  }

  writeLine(str?: string) {
    this.write(str);
    this.write("\n");
  }
}
