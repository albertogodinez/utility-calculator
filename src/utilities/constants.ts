import { RequestOptions } from 'https';

export const OPTION_HEADERS: RequestOptions = {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    // This is the default value, but for the most part we will need to set it with the
    // correct value which can be obtained by calling Buffer.byteLength(postData)
    // or using getOptionsWithCalculatedContentLength(postData)
    'Content-Length': '0',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    DNT: '1',
    Origin: 'https://austintx.watersmart.com',
    Referer: 'https://austintx.watersmart.com/index.php/logout',
    'Sec-CH-UA': '"Chromium";v="127", "Not)A;Brand";v="99"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  },
};

export const LOGIN_OPTIONS: RequestOptions = {
  hostname: 'austintx.watersmart.com',
  path: '/index.php/logout/login?forceEmail=1',
  method: 'POST',
  ...OPTION_HEADERS,
};

export function getOptionsWithCalculatedContentLength(
  postData: string,
): RequestOptions {
  return {
    ...LOGIN_OPTIONS,
    headers: {
      ...LOGIN_OPTIONS.headers,
      'Content-Length': Buffer.byteLength(postData),
    },
  };
}

export function getHeadersWithCookie(cookie: string): RequestOptions {
  return {
    headers: {
      ...LOGIN_OPTIONS.headers,
      Cookie: cookie,
    },
  };
}
