export const socketFlushWriteAsync = async (socket: NodeJS.WriteStream, str: string) => {
  await new Promise((resolve) => {
    const flushed = socket.write(str);
    if (flushed) {
      resolve();
    } else {
      socket.once("drain", resolve);
    }
  });
};
