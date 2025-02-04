import type { CrawlerEvents } from './types.js';
import { createEmitter } from './emitter.js';

export const createFakeCrawler = () => {
  const { emit, on, promise } = createEmitter<CrawlerEvents>();
  return {
    fakeCrawler: () => ({
      promise,
      on,
    }),
    emit,
  };
};
