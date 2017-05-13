import Socket = NodeJS.Socket;
import * as chalk from 'chalk';

export interface OutputBufferData {
  type: string;
  data: Buffer;
}

export interface OutputBufferSocketConfig {
  [id: string]: {
    socket: Socket;
    color?: string;
  };
}

export class OutputBuffer {
  private _output: OutputBufferData[] = [];

  constructor(
    private readonly _linePrefix: string,
    private readonly _socketConfig: OutputBufferSocketConfig
  ) {
  }

  write(bufData: OutputBufferData) {
    if (bufData.data.length > 0) {
      this._output.push(bufData);
    }
  }

  writeString(type: string, str: string) {
    if (chalk.stripColor(str).length > 0) {
      this._output.push({
        type: type,
        data: Buffer.from(str, 'utf-8')
      });
    }
  }

  flush() {
    const linePrefix = this._linePrefix;

    let lastEndedInNewLine = true;
    let lastType = undefined;
    for (const b of this._output) {
      const type = b.type;
      if (type !== lastType) {
        lastType = type;
        lastEndedInNewLine = true;
      }

      const socketConfig = this._socketConfig[b.type];
      if (!socketConfig) continue;

      const {socket, color} = socketConfig;

      let str = b.data.toString('utf-8');

      str = str.split('\r').join('');

      const lines = str.split('\n');
      const prefixedLines: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (color) {
          line = chalk.dim[color](line);
        }
        if ((i === lines.length - 1 && chalk.stripColor(line).length <= 0) || (i === 0 && !lastEndedInNewLine)) {
          prefixedLines.push(line);
        }
        else {
          prefixedLines.push(linePrefix + line);
        }
      }

      const text = prefixedLines.join('\n');
      socket.write(text);

      const uncoloredText = chalk.stripColor(text);
      lastEndedInNewLine = uncoloredText.length > 0 && uncoloredText[uncoloredText.length - 1] === '\n';
    }

    this._output = [];
  }

  hasData() {
    return this._output.length > 0;
  }
}
