export const limitPromiseConcurrency = <T>(concurrency: number): (fn: () => PromiseLike<T>) => Promise<T> => {
  if (concurrency < 1) {
    throw new Error(`'concurrency' must be >= 1`);
  }

  const queue: (() => void)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;

    if (queue.length > 0) {
      const newRun = queue.shift();
      if (newRun !== undefined) {
        newRun();
      }
    }
  };

  return (wrappedPromise) => new Promise<T>((resolve, reject) => {
    const run = () => {
      activeCount++;

      wrappedPromise().then(
        (val: any) => {
          resolve(val);
          next();
        },
        (err: any) => {
          reject(err);
          next();
        }
      );
    };

    if (activeCount < concurrency) {
      run();
    } else {
      queue.push(run);
    }
  });
};
