import fs from 'fs';
import path from 'path';
import { reportToRow, reportToRowHeaders } from './report-to-row.js';
import { stringify as csvStringify } from 'csv-stringify/sync';

const { readdir, writeFile } = fs.promises;

/** Combines the individual report CSV's from a folder into a single CSV file */
export const aggregateCSVReports = async (dataDirPath: string) => {
  const reportsDirPath = path.join(dataDirPath, 'reports');
  const files = await readdir(reportsDirPath);

  const rows = [];
  let headers: string[] | null = null;

  for (const fileName of files) {
    if (fileName === '.DS_Store') {
      continue;
    }

    const filePath = path.join(reportsDirPath, fileName);
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const content = JSON.parse(fileContents);
    // If headers aren't set yet, do it now
    if (!headers) headers = reportToRowHeaders(content);
    const newRow = reportToRow(content);
    if (newRow) {
      rows.push(newRow);
    } else {
      console.log(`Failed to bundle: ${fileName}`);
    }
  }

  rows.unshift(headers);

  const aggregatedReportData = csvStringify(rows);

  const writePath = path.join(dataDirPath, 'aggregatedReport.csv');
  await writeFile(writePath, aggregatedReportData);
};
