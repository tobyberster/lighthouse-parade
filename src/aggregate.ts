import fs from 'fs';
import path from 'path';
import { reportToRow, reportToRowHeaders } from './report-to-row.js';
import { CSVReportRow, DBConfig } from './types.js';
import { stringify as csvStringify } from 'csv-stringify/sync';
import mysql, { ConnectionOptions } from 'mysql2/promise';

const { readdir, writeFile } = fs.promises;

/** Combines the individual report CSV's from a folder into a single CSV file */
export const persistReportsToCSV = async (dataDirPath: string, rows: CSVReportRow[]) => {
  const aggregatedReportData = csvStringify(rows);

  const writePath = path.join(dataDirPath, 'aggregatedReport.csv');
  await writeFile(writePath, aggregatedReportData);
};

export const persistReportsToDatabase = async (dbConfig: DBConfig, rows: CSVReportRow[]) => {
  const connection = await mysql.createConnection(dbConfig as ConnectionOptions);
  const headers = rows.shift() as string[];
  const dbColumns = mapHeadersToDBColumns(headers);

  try {
    const columns = dbColumns.join(', ');
    const placeholders = dbColumns.map(() => '?').join(', ');

    for (const row of rows) {
      const values = row.slice(0, dbColumns.length).map((value, index) => {
        if (dbColumns[index] === 'fetchTime' && typeof value === 'string') {
          const date = new Date(value);
          const utcDate = new Date(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds()
          );
          return utcDate;
        }
        return value;
      });

      await connection.execute(
        `INSERT INTO reports (${columns}) VALUES (${placeholders})`,
        values
      );
    }
  } catch (error) {
    console.error('Error persisting reports to database:', error);
  } finally {
    await connection.end();
  }
}

export const aggregateReports = async (dataDirPath: string, csvExport: boolean, persistToDatabase: boolean, dbConfig?: DBConfig) => {
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

  if (headers) {
    rows.unshift(headers as CSVReportRow);
  }

  if (persistToDatabase && dbConfig) {
    await persistReportsToDatabase(dbConfig, rows);
  }

  if (csvExport) {

    await persistReportsToCSV(dataDirPath, rows);
  }
}

const mapHeadersToDBColumns = (headers: string[]): string[] => {
  const headerMapping: { [key: string]: string } = {
    'URL': 'finalUrl',
    'Normalized URL': 'normalizedUrl',
    'Protocol': 'protocol',
    'Form Factor': 'formFactor',
    'Version': 'lighthouseVersion',
    'Runtime': 'fetchTime',
    'Performance': 'performance',
    'Accessibility': 'accessibility',
    'Best Practices': 'bestPractices',
    'SEO': 'seo'
  };

  return headers.map((header) => {
    const mapped = headerMapping[header];
    if (!mapped) {
      throw new Error(`Unknown header encountered: "${header}"`);
    }
    return mapped;
  });
};