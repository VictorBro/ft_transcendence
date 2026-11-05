/**
 * Runs async tasks one after another, in the order they were queued, so two
 * writes of the same setting reach the server in the order the learner made
 * them. A task that fails does not stop the ones after it.
 */
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();

  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}
