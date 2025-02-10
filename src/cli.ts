#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as kleur from 'kleur/colors';
import logUpdate from 'log-update';
import * as path from 'path';
import sade from 'sade';
import { scan } from './scan-task.js';
import { makeFileNameFromUrl, usefulDirName } from './utilities.js';
import { aggregateReports } from './aggregate.js';
import { DBConfig } from './types.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/*
This is a require because if it was an import, TS would copy package.json to `dist`
If TS copied package.json to `dist`, npm would not publish the JS files in `dist`
Since it is a require, TS leaves it as-is, which means that the require path
has to be relative to the built version of this file in the dist folder
It may in the future make sense to use a bundler to combine all the dist/ files into one file,
(including package.json) which would eliminate this problem
*/
// eslint-disable-next-line @cloudfour/typescript-eslint/no-var-requires
const { version } = require('../../package.json');

const symbols = {
  error: kleur.red('✖'),
  success: kleur.green('✔'),
};

const toArray = <T extends unknown>(input: T) =>
  Array.isArray(input) ? input : [input];

/** Returns whether the given path is a full URL (with protocol, domain, etc.) */
const isFullURL = (path: string) => {
  try {
    // eslint-disable-next-line no-new
    new URL(path);
    return true;
  } catch { }

  return false;
};

dotenv.config();

sade('lighthouse-parade <url> [dataDirectory]', true)
  .version(version)
  .example(
    'https://cloudfour.com --exclude-path-glob "/thinks/*" --max-crawl-depth 2'
  )
  .describe(
    'Crawls the site at the provided URL, recording the lighthouse scores for each URL found. The lighthouse data will be stored in the provided directory, which defaults to ./data/YYYY-MM-DDTTZ_HH_MM'
  )
  .option(
    '--ignore-robots',
    "Crawl pages even if they are listed in the site's robots.txt",
    false
  )
  .option(
    '--crawler-user-agent',
    'Pass a user agent string to be used by the crawler (not by Lighthouse)'
  )
  .option(
    '--lighthouse-concurrency',
    'Control the maximum number of ligthhouse reports to run concurrently',
    os.cpus().length - 1
  )
  .option(
    '--max-crawl-depth',
    'Control the maximum depth of crawled links. 1 means only the entry page will be used. 2 means the entry page and any page linked directly from the entry page will be used.'
  )
  .option(
    '--include-path-glob',
    'Specify a glob (in quotes) for paths to match. Links to non-matched paths will not be crawled. The entry page will be crawled regardless of this flag. This flag can be specified multiple times to allow multiple paths. `*` matches one url segment, `**` matches multiple segments. Trailing slashes are ignored.'
  )
  .option(
    '--exclude-path-glob',
    'Specify a glob (in quotes) for paths to exclude. Links to matched paths will not be crawled. The entry page will be crawled regardless of this flag. This flag can be specified multiple times to exclude multiple paths. `*` matches one url segment, `**` matches multiple segments. Trailing slashes are ignored.'
  )
  .option(
    '--categories',
    'Specify which categories to include in the Lighthouse report. If not specified, all categories will be included.'
  )
  .option(
    '--form-factor',
    'Specify the form factor to use when running Lighthouse. Options are `mobile` or `desktop`, or both separated by a comma. Default is `mobile`.'
  )
  .option(
    '--enable-full-page-screenshot',
    'Enable full page screenshots in Lighthouse reports',
    false
  )
  .option(
    '--csv-export',
    'Export the aggregated report data to a CSV file. Default is true.',
    false
  )
  .option(
    '--persist',
    'Persist the aggregated report data to a database. Default is true.',
    false
  )
  .option(
    '--sitemap',
    'Identify the sitemap URL for the site. If provided, the sitemap will be used to seed the crawler instead of the provided URL.',
    false
  )
  .action(
    (
      url,
      // eslint-disable-next-line default-param-last
      dataDirPath = path.join(
        process.cwd(),
        'lighthouse-parade-data',
        usefulDirName()
      ),
      opts
    ) => {
      // We are attempting to parse the URL here, so that if the user passes an invalid URL,
      // the prorgam will exit here instead of continuing (which would lead to a more confusing error)
      // eslint-disable-next-line no-new
      new URL(url);

      const ignoreRobotsTxt: boolean = opts['ignore-robots'] ?? process.env.IGNORE_ROBOTS === 'true' ?? false;
      const enableFullPageScreenshot: boolean = opts['enable-full-page-screenshot'] ?? process.env.ENABLE_FULL_PAGE_SCREENSHOT === 'true' ?? false;
      const csvExport: boolean = opts['csv-export'] ?? process.env.CSV_EXPORT === 'true' ?? false;
      const persistToDatabase: boolean = opts['persist'] ?? process.env.PERSIST_TO_DATABASE === 'true' ?? false;
      const useSitemap: boolean = opts['sitemap'] ?? process.env.SITEMAP === 'true' ?? false;

      const reportsDirPath = path.join(dataDirPath, 'reports');
      fs.mkdirSync(reportsDirPath, { recursive: true });

      const userAgent: unknown = opts['crawler-user-agent'] ?? process.env.CRAWLER_USER_AGENT;
      if (userAgent !== undefined && typeof userAgent !== 'string') {
        throw new Error('--crawler-user-agent must be a string');
      }

      const maxCrawlDepth: unknown = opts['max-crawl-depth'] ?? (process.env.MAX_CRAWL_DEPTH && parseInt(process.env.MAX_CRAWL_DEPTH));

      if (maxCrawlDepth !== undefined && typeof maxCrawlDepth !== 'number') {
        throw new Error('--max-crawl-depth must be a number');
      }

      const includePathGlob: unknown[] = toArray(
        opts['include-path-glob'] as unknown
      ).filter((glob) => glob !== undefined);

      if (includePathGlob.some((glob) => typeof glob !== 'string')) {
        throw new Error('--include-path-glob must be string(s)');
      }

      if ((includePathGlob as string[]).some(isFullURL)) {
        throw new Error('--include-path-glob must be path(s), not full URL(s)');
      }

      const excludePathGlob: unknown[] = toArray(
        opts['exclude-path-glob'] as unknown
      ).filter((glob) => glob !== undefined);

      if (excludePathGlob.some((glob) => typeof glob !== 'string')) {
        throw new Error('--exclude-path-glob must be string(s)');
      }

      if ((excludePathGlob as string[]).some(isFullURL)) {
        throw new Error('--exclude-path-glob must be path(s), not full URL(s)');
      }

      const lighthouseConcurrency = opts['lighthouse-concurrency'] ?? (process.env.LIGHTHOUSE_CONCURRENCY && parseInt(process.env.LIGHTHOUSE_CONCURRENCY))
        ?? os.cpus().length - 1;

      const validCategories = ['performance', 'accessibility', 'best-practices', 'seo'];
      const categoriesOption: unknown = opts['categories'] || process.env.CATEGORIES?.split(',') || null;
      let categories: string[] | null = null;

      if (categoriesOption !== null && categoriesOption !== undefined) {
        if (typeof categoriesOption !== 'string') {
          throw new Error('--categories must be a comma-separated string or null');
        }

        // Split the input by commas, trim each value, and filter out empty strings
        categories = categoriesOption
          .split(',')
          .map((category) => category.trim())
          .filter((category) => category.length > 0);

        // Validate that all provided categories are valid
        const invalidCategories = categories.filter((category) => !validCategories.includes(category));
        if (invalidCategories.length > 0) {
          throw new Error(
            `--categories contains invalid value(s): ${invalidCategories.join(', ')}. ` +
            `Valid values are: ${validCategories.join(', ')}`
          );
        }
      }

      const validFormFactors = ['mobile', 'desktop'];
      const formFactorOption: unknown = opts['form-factor'] || process.env.FORM_FACTOR?.split(',') || [];
      let formFactors: string[] = ['mobile'];

      if (formFactorOption !== null && formFactorOption !== undefined) {
        if (typeof formFactorOption !== 'string') {
          throw new Error('--form-factor must be a comma-separated string or null');
        }

        // Split the input by commas, trim each value, and filter out empty strings
        formFactors = formFactorOption
          .split(',')
          .map((formFactor) => formFactor.trim())
          .filter((formFactor) => formFactor.length > 0);

        // Validate that all provided form factors are valid
        const invalidFormFactors = formFactors.filter((formFactor) => !validFormFactors.includes(formFactor));
        if (invalidFormFactors.length > 0) {
          throw new Error(
            `--form-factor contains invalid value(s): ${invalidFormFactors.join(', ')}. ` +
            `Valid values are: ${validFormFactors.join(', ')}`
          );
        }
      }

      // Database configuration
      const dbConfig: DBConfig = (process.env.DB_HOST &&
        process.env.DB_USER &&
        process.env.DB_PASSWORD &&
        process.env.DB_NAME)
        ? {
          host: process.env.DB_HOST,
          port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432, // default port
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
        }
        : null;
      if (persistToDatabase && !dbConfig) {
        throw new Error('Database configuration is required to persist data to the database or disable the --persist flag');
      }

      const scanner = scan(url, {
        ignoreRobotsTxt,
        dataDirectory: dataDirPath,
        lighthouseConcurrency,
        maxCrawlDepth,
        includePathGlob: includePathGlob as string[],
        excludePathGlob: excludePathGlob as string[],
        categories,
        formFactors,
        enableFullPageScreenshot,
        useSitemap,
      });

      const enum State {
        Pending,
        ReportInProgress,
        ReportComplete,
      }
      const urlStates = new Map<
        string,
        { state: State; error?: Error | string }
      >();

      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let i = 0;

      const printLine = (url: string, state: State, error?: Error | string) => {
        const frame = kleur.blue(frames[i]);
        const statusIcon = error
          ? symbols.error
          : state === State.Pending
            ? ' '
            : state === State.ReportInProgress
              ? frame
              : symbols.success;
        let output = `${statusIcon} ${url}`;
        if (error) {
          output += `\n  ${kleur.gray(error.toString())}`;
        }

        return output;
      };

      const render = () => {
        const pendingUrls: string[] = [];
        const currentUrls: string[] = [];
        // eslint-disable-next-line @cloudfour/unicorn/no-array-for-each
        urlStates.forEach(({ state, error }, url) => {
          if (state === State.ReportComplete) return;
          const line = `${printLine(url, state, error)}\n`;
          if (state === State.Pending) pendingUrls.push(line);
          else currentUrls.push(line);
        });
        const numPendingToDisplay = Math.min(
          Math.max(process.stdout.rows - currentUrls.length - 3, 1),
          pendingUrls.length
        );
        const numHiddenUrls =
          numPendingToDisplay === pendingUrls.length
            ? ''
            : kleur.dim(
              `\n...And ${pendingUrls.length - numPendingToDisplay
              } more pending`
            );
        logUpdate(
          currentUrls.join('') +
          pendingUrls.slice(0, numPendingToDisplay).join('') +
          numHiddenUrls
        );
      };

      const intervalId = setInterval(() => {
        i = (i + 1) % frames.length;
        render();
      }, 80);

      /**
       * Allows you to run a console.log that will output _above_ the persistent logUpdate log
       * Pass a callback where you run your console.log or console.error
       */
      const printAboveLogUpdate = (cb: () => void) => {
        logUpdate.clear();
        cb();
        render();
      };

      const log = (...messages: any[]) =>
        printAboveLogUpdate(() => console.log(...messages));
      const warn = (...messages: any[]) =>
        printAboveLogUpdate(() => console.log(...messages));

      const urlsFile = path.join(dataDirPath, 'urls.csv');
      fs.writeFileSync(urlsFile, 'URL,content_type,bytes,response\n');
      const urlsStream = fs.createWriteStream(urlsFile, { flags: 'a' });

      scanner.on('urlFound', (url, contentType, bytes, statusCode) => {
        urlStates.set(url, { state: State.Pending });
        const csvLine = [
          JSON.stringify(url),
          contentType,
          bytes,
          statusCode,
        ].join(',');
        urlsStream.write(`${csvLine}\n`);
      });
      scanner.on('reportBegin', (url) => {
        urlStates.set(url, { state: State.ReportInProgress });
      });
      scanner.on('reportFail', (url, error) => {
        urlStates.set(url, { state: State.ReportComplete, error });
        log(printLine(url, State.ReportComplete, error));
      });
      scanner.on('reportComplete', (url, reportData, formFactor) => {
        urlStates.set(url, { state: State.ReportComplete });
        log(printLine(url + ' (' + formFactor + ')', State.ReportComplete));
        const reportFileName = makeFileNameFromUrl(url + '-' + formFactor, 'json');

        fs.writeFileSync(path.join(reportsDirPath, reportFileName), reportData);
      });

      scanner.on('info', (message) => {
        log(message);
      });

      scanner.on('warning', (message) => {
        warn(message);
      });

      scanner.promise.then(async () => {
        clearInterval(intervalId);

        console.log('Aggregating reports...');

        await aggregateReports(dataDirPath, csvExport, persistToDatabase, dbConfig || undefined);

        console.log('DONE!');
      });
    }
  )
  .parse(process.argv);
