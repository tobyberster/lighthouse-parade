import sanitize from 'sanitize-filename';
import { URL } from 'url';
import { OutputFormat } from './types.js';

export const isContentTypeHtml = (contentType?: string) => {
  return contentType?.toLowerCase().includes('html');
};

export const usefulDirName = () => {
  const date = new Date();
  const iso = date.toISOString();
  const withoutColons = iso.replace(/:/g, '_');
  const trimmed = withoutColons.split('.')[0];
  return trimmed;
};

export const makeFileNameFromUrl = (url: string, extension: OutputFormat) => {
  // Strip common prefixes
  const strippedUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '');

  const newUrl = strippedUrl.replace(/\./g, '_').replace(/\//g, '-');
  return `${sanitize(newUrl)}.${extension}`;
};

export const normalizeUrl = (inputUrl: string): { normalizedUrl: string; protocol: string } => {
  try {
    const url = new URL(inputUrl);

    const protocol = url.protocol.replace(':', '').toLowerCase();

    // Remove subdomain
    const hostnameParts = url.hostname.split('.');
    const domain = hostnameParts.slice(-2).join('.');

    // Construct normalized URL without protocol, subdomain, and port
    let normalizedUrl = `${domain}${url.pathname}`;

    if (url.search) {
      const params = new URLSearchParams(url.search);
      const sortedParams = new URLSearchParams();
      [...params.entries()].sort().forEach(([key, value]) => {
        sortedParams.append(key, value);
      });
      normalizedUrl += `?${sortedParams.toString()}`;
    }

    if (normalizedUrl.endsWith('/') && normalizedUrl !== '/') {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }

    return {
      normalizedUrl,
      protocol
    };
  } catch (error) {
    throw new Error('Invalid URL provided.');
  }
}
