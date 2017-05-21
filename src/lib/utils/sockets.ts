import Socket = NodeJS.Socket;

export const socketFlushWriteAsync = async (socket: Socket, str: string) => {
  await new Promise((resolve) => {
    const flushed = socket.write(str);
    if (flushed) {
      resolve();
    }
    else {
      socket.once('drain', resolve);
    }
  });
};
