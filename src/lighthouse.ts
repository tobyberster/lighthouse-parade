import { spawn } from 'child_process';
import { createEmitter } from './emitter.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const lighthouseCli = require.resolve('lighthouse/cli');

let lighthouseLimit = 2;
let currentLighthouseInstances = 0;
const lighthouseQueue: (() => void)[] = [];

const runLighthouseQueue = () => {
  while (
    lighthouseQueue.length > 0 &&
    currentLighthouseInstances < lighthouseLimit
  ) {
    const run = lighthouseQueue.shift() as () => void;
    currentLighthouseInstances++;
    run();
  }
};

export type LighthouseEvents = {
  begin: () => void;
  complete: (reportData: string) => void;
  error: (message: Error) => void;
};

export const runLighthouseReport = (
  url: string,
  maxConcurrency?: number,
  categories?: string[] | null,
  formFactor: string = 'mobile',
  enableFullPageScreenshot: boolean = false
) => {
  if (maxConcurrency) lighthouseLimit = maxConcurrency;
  const { on, emit } = createEmitter<LighthouseEvents>();
  const run = () => {
    emit('begin');

    // Construct the `--only-categories` argument if categories are provided
    const categoryArgs = categories && categories.length > 0
      ? [`--only-categories=${categories.join(',')}`]
      : [];

    const formFactorArg = formFactor === 'desktop' ? ['--preset=desktop'] : [];

    const lighthouseProcess = spawn('node', [
      lighthouseCli,
      url,
      '--output=json',
      '--output-path=stdout',
      '--chrome-flags="--headless"',
      '--max-wait-for-load=45000',
      enableFullPageScreenshot ? '' : '--disable-full-page-screenshot',
      ...categoryArgs,
      ...formFactorArg,
    ]);

    let stdout = '';
    let stderr = '';

    lighthouseProcess.stdout.on('data', (d) => {
      stdout += d;
    });

    lighthouseProcess.stderr.on('data', (d) => {
      if (/runtime error encountered/i.test(d)) stderr += d;
    });

    lighthouseProcess.on('close', (status) => {
      if (status === 0) {
        emit('complete', String(stdout).replace(/\r\n/g, '\n'));
      } else {
        emit(
          'error',
          new Error(stderr.trim() || `Lighthouse report failed for: ${url}`)
        );
      }

      currentLighthouseInstances--;
      runLighthouseQueue();
    });
  };

  lighthouseQueue.push(run);
  runLighthouseQueue();

  return { on };
};
