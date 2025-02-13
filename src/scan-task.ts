import fs from 'fs';
import { runLighthouseReport } from './lighthouse.js';
import type { CrawlOptions } from './crawl.js';
import { PageCrawler as defaultCrawler, createCrawler } from './crawl.js';
import { createEmitter } from './emitter.js';
import type { ScanEvents } from './types.js';

interface ScanOptions extends CrawlOptions {
  /** Where to store the newly-generated reports */
  dataDirectory: string;
  /**
   * Function to determine whether to run lighthouse on a given URL
   * The intended use case for this is to skip URL's where there are already reports saved from previous runs.
   */
  crawler?: typeof defaultCrawler;
  lighthouse?: typeof runLighthouseReport;
  lighthouseConcurrency: number;
  categories?: string[] | null;
  formFactors?: string[] | null;
  enableFullPageScreenshot?: boolean | false;
  useSitemap?: boolean | false;
}

export const scan = (
  siteUrl: string,
  {
    crawler = defaultCrawler,
    lighthouse = runLighthouseReport,
    dataDirectory,
    lighthouseConcurrency,
    categories,
    formFactors,
    enableFullPageScreenshot,
    useSitemap,
    ...opts
  }: ScanOptions
) => {
  const { promise, on, emit } = createEmitter<ScanEvents>();
  fs.mkdirSync(dataDirectory, { recursive: true });
  /** Used so we can display an error if no pages are found while crawling */
  let hasFoundAnyPages = false;

  emit('info', 'Starting the crawl...');

  //const crawlerEmitter = crawler(siteUrl, opts);
  const crawlerEmitter = createCrawler(useSitemap ? 'sitemap' : 'standard', siteUrl, opts);

  const lighthousePromises: Promise<void>[] = [];

  crawlerEmitter.on('urlFound', (url, contentType, bytes, statusCode) => {
    hasFoundAnyPages = true;
    emit('urlFound', url, contentType, bytes, statusCode);
    (formFactors ?? ['mobile']).forEach((formFactor) => {
      lighthousePromises.push(
        new Promise((resolve) => {
          lighthouse(url, lighthouseConcurrency, categories, formFactor, enableFullPageScreenshot)
            .on('begin', () => emit('reportBegin', url))
            .on('complete', (reportData) => {
              emit('reportComplete', url, reportData, formFactor);
              resolve();
            })
            .on('error', (error) => {
              emit('reportFail', url, error);
              // Resolves instead of rejects because we want to continue with the other lighthouses even if one fails
              resolve();
            });
        })
      );
    });
  });

  crawlerEmitter.on('warning', (message) => emit('warning', message));

  crawlerEmitter.promise
    .then(async () => {
      await Promise.all(lighthousePromises);
      emit('info', 'Scan complete');

      if (!hasFoundAnyPages) {
        emit(
          'warning',
          `No pages were found for this site. The two most likely reasons for this are:
1) the URL is incorrect
2) the crawler is being denied by a robots.txt file`
        );
        return;
      }

      emit('resolve');
    })
    .catch((error) => emit('reject', error));
  return { promise, on };
};
