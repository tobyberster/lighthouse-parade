// import path from 'path';
// import fs from 'fs';
// import { persistReportsToCSV } from '../src/aggregate.js';
// import { parse as csvParse } from 'csv-parse';
import { describe, it/*, expect*/ } from 'vitest';

describe('aggregateCSVReports', () => {
  it.skip('creates the expected csv', async () => {
    // const dataPath = path.join(__dirname, 'support', 'example2');
    // await persistReportsToCSV(dataPath);
    // const expected = fs.readFileSync(
    //   path.join(dataPath, 'expectedAggregatedMobileReport.csv')
    // );
    // const data = fs.readFileSync(
    //   path.join(dataPath, 'aggregatedMobileReport.csv')
    // );
    // expect(data.equals(expected)).toEqual(true);
  });

  it.skip('skips erroneous files', async () => {
    // This directory has bad files in it
    // const dataPath = path.join(__dirname, 'support', 'example3');
    // await aggregateCSVReports(dataPath);
    // const data = fs.readFileSync(
    //   path.join(dataPath, 'aggregatedMobileReport.csv'),
    //   'utf8'
    // );
    // const parsed = csvParse(data);
    //expect(parsed.length).toEqual(2); // Expecting header + one real row
  });
});
