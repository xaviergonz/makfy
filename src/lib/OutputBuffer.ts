import Socket = NodeJS.Socket;
import * as chalk from 'chalk';
import { getTimeString } from './utils';

export interface OutputBufferData {
  type: string;
  data: Buffer;
}

export interface OutputBufferSocketConfig {
  [id: string]: {
    socket: Socket;
    color: string;
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

  flush() {
    const linePrefix = this._linePrefix;

    let lastEndedInNewLine = true;
    let lastType = undefined;
    for (const b of this._output) {
      const type = b.type;
      if (type !== lastType) {
        lastEndedInNewLine = true;
        lastType = type;
      }

      const socketConfig = this._socketConfig[b.type];
      if (!socketConfig) continue;
      const {socket, color} = socketConfig;

      let str = b.data.toString('utf-8');
      str = str.split('\r').join('');

      const lines = str.split('\n');
      const prefixedLines: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i === 0 && !lastEndedInNewLine) {
          prefixedLines.push(line);
        }
        else {
          prefixedLines.push(linePrefix + getTimeString() + chalk.dim[color](type + '/  ') + line);
        }
      }

      const text = prefixedLines.join('\n');
      lastEndedInNewLine = text.length > 0 && text[text.length - 1] === '\n';
      socket.write(text);
    }

    this._output = [];
  }

  hasData() {
    return this._output.length > 0;
  }
}
