export const reportToRowHeaders = (report: any) => {
  const categories: string[] = [];

  Object.values(report.categories).forEach((category: any) => {
    categories.push(category.title);
  });

  const headers = [
    'URL',
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

  const result: string[] = [];

  for (const key of Object.keys(categories)) {
    const category = categories[key];
    if (category && typeof category === "object" && "score" in category) {
      result.push(category.score);
    }
  }

  const csvRow: CSVReportRow = [
    finalUrl,
    configSettings.formFactor,
    lighthouseVersion,
    fetchTime,
    ...result,
  ];
  return csvRow;
};

type CSVReportRow = [
  finalUrl: string,
  formFactor: string,
  lighthouseVersion: string,
  fetchTime: string,
  ...scores: string[]
];
