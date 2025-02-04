export type CSVReportRow = [
    finalUrl: string,
    normalizedUrl: string,
    protocol: string,
    formFactor: string,
    lighthouseVersion: string,
    fetchTime: string,
    ...scores: string[]
];

export type DBConfig = {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
} | null;

export type OutputFormat = 'json' | 'html' | 'csv';

export type CrawlerEvents = {
    urlFound: (
        url: string,
        contentType: string,
        bytes: number,
        statusCode: number
    ) => void;
    warning: (message: string | Error) => void;
};

export type LighthouseEvents = {
    begin: () => void;
    complete: (reportData: string) => void;
    error: (message: Error) => void;
};

export type ScanEvents = {
    warning: (message: string | Error) => void;
    info: (message: string) => void;
    reportBegin: (url: string) => void;
    reportFail: (url: string, error: string | Error) => void;
    reportComplete: (url: string, reportData: string, formFactor: string) => void;
    resolve: () => void;
    urlFound: (
        url: string,
        contentType: string,
        bytes: number,
        statusCode: number
    ) => void;
};