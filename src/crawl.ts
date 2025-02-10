import Crawler from 'simplecrawler';
import Sitemapper from 'sitemapper';
import type { QueueItem } from 'simplecrawler/queue.js';
import type { IncomingMessage } from 'http';
import { createEmitter } from './emitter.js';
import { isContentTypeHtml } from './utilities.js';
import { CrawlerEvents } from './types.js';
import globrex from 'globrex';

export interface CrawlOptions {
  /** Whether to crawl pages even if they are listed in the site's robots.txt */
  ignoreRobotsTxt: boolean;
  userAgent?: string;
  /** Maximum depth of fetched links */
  maxCrawlDepth?: number;
  /** Any path that doesn't match these globs will not be crawled. If the array is empty, all paths are allowed. */
  includePathGlob: string[];
  /** Any path that matches these globs will not be crawled. */
  excludePathGlob: string[];
}

const globOpts: globrex.Options = { globstar: true, extended: true };

export const createUrlFilter = (
  includeGlob: string[],
  excludeGlob: string[]
) => {
  const pathIncludeRegexes = includeGlob.map(
    (glob) => globrex(glob.replace(/\/$/, ''), globOpts).regex
  );
  const pathExcludeRegexes = excludeGlob.map(
    (glob) => globrex(glob.replace(/\/$/, ''), globOpts).regex
  );
  return ({ path }: { path: string }) => {
    const withoutTrailingSlash = path.replace(/\/$/, '');
    return (
      (pathIncludeRegexes.length === 0 ||
        pathIncludeRegexes.some((regex) => regex.test(withoutTrailingSlash))) &&
      !pathExcludeRegexes.some((regex) => regex.test(withoutTrailingSlash))
    );
  };
};

export class PageCrawler {
  private url: string;
  private opts: CrawlOptions;

  constructor(siteUrl: string, opts: CrawlOptions) {
    this.url = siteUrl;
    this.opts = opts;
  }

  crawl() {
    const { on, emit, promise } = createEmitter<CrawlerEvents>();
    const crawler = new Crawler(this.url);

    if (this.opts.userAgent) crawler.userAgent = this.opts.userAgent;
    crawler.respectRobotsTxt = !this.opts.ignoreRobotsTxt;
    if (this.opts.maxCrawlDepth !== undefined) crawler.maxDepth = this.opts.maxCrawlDepth;

    const initialPath = new URL(this.url).pathname;
    crawler.addFetchCondition(
      createUrlFilter(
        this.opts.includePathGlob.length > 0
          ? [...this.opts.includePathGlob, initialPath]
          : [],
        this.opts.excludePathGlob
      )
    );

    const emitWarning = (queueItem: QueueItem, response: IncomingMessage) => {
      emit(
        'warning',
        `Error fetching (${response.statusCode}): ${queueItem.url}`
      );
    };

    crawler.on('fetchcomplete', (queueItem, responseBuffer, response) => {
      const url = queueItem.url;
      const contentType = response.headers['content-type'];
      if (!isContentTypeHtml(contentType)) return;
      const statusCode = response.statusCode;
      if (!contentType || !statusCode) return;
      emit('urlFound', url, contentType, responseBuffer.length, statusCode);
    });

    crawler.on('complete', () => emit('resolve'));
    crawler.on('fetcherror', emitWarning);
    crawler.on('fetch404', emitWarning);
    crawler.on('fetch410', emitWarning);

    crawler.start();
    return { on, promise };
  }
}

export class SitemapCrawler {
  private sitemapper: Sitemapper;
  private url: string;
  private opts: CrawlOptions;

  constructor(siteUrl: string, opts: CrawlOptions) {
    this.url = siteUrl;
    this.opts = opts;
    this.sitemapper = new Sitemapper({
      url: `${siteUrl.replace(/\/$/, '')}/sitemap.xml`,
      timeout: 10000
    });
  }

  crawl() {
    const { on, emit, promise } = createEmitter<CrawlerEvents>();

    // Handle sitemap fetching asynchronously but return synchronously
    this.sitemapper.fetch()
      .then(async ({ sites, sitemaps }) => {
        let allSites = sites;
        if (sitemaps && sitemaps.length > 0) {
          const additionalSites = await Promise.all(
            sitemaps.map(async (sitemapUrl) => {
              const additionalSitemapper = new Sitemapper({
                url: sitemapUrl,
                timeout: 10000
              });
              const additionalResult = await additionalSitemapper.fetch();
              return additionalResult.sites;
            })
          );
          allSites = allSites.concat(...additionalSites);
        }

        const urlFilter = createUrlFilter(
          this.opts.includePathGlob.length > 0
            ? [...this.opts.includePathGlob, new URL(this.url).pathname]
            : [],
          this.opts.excludePathGlob
        );

        const filteredSites = allSites.filter(site => {
          try {
            const path = new URL(site).pathname;
            return urlFilter({ path });
          } catch {
            return false;
          }
        });

        filteredSites.forEach(site => {
          emit('urlFound', site, 'text/html', 0, 200);
        });

        emit('resolve');
      })
      .catch(error => {
        emit('warning', `Sitemap crawl failed: ${error}. Falling back to standard crawl.`);
        emit('resolve');
      });

    return { on, promise };
  }
}

// Factory for creating crawlers
export const createCrawler = (type: 'standard' | 'sitemap', siteUrl: string, opts: CrawlOptions): {
  on: <E extends keyof CrawlerEvents>(
    eventName: E,
    handler: CrawlerEvents[E]
  ) => void;
  promise: Promise<void>
} => {
  if (type === 'standard') {
    return new PageCrawler(siteUrl, opts).crawl();
  } else {
    return new SitemapCrawler(siteUrl, opts).crawl();
  }
};