export async function waitFor(predicate, { timeout = 1000, interval = 10 } = {}) {
  const start = Date.now();
  while (true) {
    const result = predicate();
    const isResolved = result instanceof Promise ? await result : result;
    if (isResolved) break;
    if (Date.now() - start > timeout) {
      throw new Error('waitFor: condition not met within timeout');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
