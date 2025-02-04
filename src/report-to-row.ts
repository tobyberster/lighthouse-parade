import { normalizeUrl } from './utilities.js';
import { CSVReportRow } from './types.js';

export const reportToRowHeaders = (report: any) => {
  const categories: string[] = [];

  Object.values(report.categories).forEach((category: any) => {
    categories.push(category.title);
  });

  const headers = [
    'URL',
    'Normalized URL',
    'Protocol',
    'Form Factor',
    'Version',
    'Runtime',
    ...categories,
  ];
  return headers;
};

export const reportToRow = (report: any) => {
  // Sometimes reports come out half-baked...
  if (!report || typeof report !== "object" || !report.categories || typeof report.categories !== "object") {
    return false;
  }

  const { finalUrl, configSettings, lighthouseVersion, fetchTime, categories } = report;
  const { normalizedUrl, protocol } = normalizeUrl(finalUrl);

  const result: string[] = [];

  for (const key of Object.keys(categories)) {
    const category = categories[key];
    if (category && typeof category === "object" && "score" in category) {
      result.push(category.score);
    }
  }

  const csvRow: CSVReportRow = [
    finalUrl,
    normalizedUrl,
    protocol,
    configSettings.formFactor,
    lighthouseVersion,
    fetchTime,
    ...result,
  ];
  return csvRow;
};