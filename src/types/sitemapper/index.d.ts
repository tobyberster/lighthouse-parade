declare module 'sitemapper' {
    interface SitemapperOptions {
        /**
         * URL of the sitemap to fetch
         */
        url?: string;

        /**
         * Timeout for fetching the sitemap in milliseconds
         * @default 10000
         */
        timeout?: number;
    }

    interface SitemapperResult {
        /**
         * Array of site URLs found in the sitemap
         */
        sites: string[];

        /**
         * Array of additional sitemap URLs if the root sitemap contains references to other sitemaps
         */
        sitemaps: string[];
    }

    class Sitemapper {
        /**
         * Create a new Sitemapper instance
         * @param options Configuration options for the sitemap fetch
         */
        constructor(options?: SitemapperOptions);

        /**
         * Fetch and parse the sitemap
         * @returns Promise resolving to sitemap URLs and additional sitemaps
         */
        fetch(): Promise<SitemapperResult>;
    }

    export = Sitemapper;
}