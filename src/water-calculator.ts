import fs from 'fs';
import https, { RequestOptions } from 'https';
import url from 'url';
import querystring from 'querystring';
import {
  getHeadersWithCookie,
  getOptionsWithCalculatedContentLength,
} from './utilities/constants';

class WaterCalculator {
  private outputFile = 'download.csv';

  constructor() {}

  // Function to perform login and get session cookies
  async loginAndGetSession(
    email: string,
    password: string,
    authSessionCookie: string,
  ): Promise<string> {
    const postData = querystring.stringify({
      token: '',
      email: email,
      password: password,
    });
    const options = getOptionsWithCalculatedContentLength(postData);

    const phpSessIdCookie = await new Promise<string>((resolve, reject) => {
      const req = https.request(options, async (res) => {
        if (!res || !res.statusCode) {
          reject(new Error('No response from the server.'));
          return;
        }
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const cookies = res.headers['set-cookie'];
          let phpSessIdCookie = '';
          if (cookies) {
            const sessionCookie =
              cookies.find((cookie) => cookie.startsWith('PHPSESSID')) || '';
            phpSessIdCookie = sessionCookie.split(';')[0].split('=')[1] || '';
          }

          const cookiesString = phpSessIdCookie
            ? `auth_session=${authSessionCookie}; PHPSESSID=${phpSessIdCookie}`
            : `auth_session=${authSessionCookie}`;

          const redirectUrl = url.resolve(
            `https://${options.hostname}${options.path}`,
            res.headers.location,
          );
          console.log(`First redirect is to ${redirectUrl}`);

          const updatedPhpSessIdCookie = await this.handleRedirects(
            redirectUrl,
            cookiesString,
            authSessionCookie,
          );

          phpSessIdCookie = updatedPhpSessIdCookie
            ? updatedPhpSessIdCookie
            : phpSessIdCookie;

          if (!phpSessIdCookie) {
            reject(new Error('Failed to get PHPSESSID cookie.'));
          }

          resolve(phpSessIdCookie);
        } else {
          reject(new Error(`Unexpected status code: ${res.statusCode}`));
        }
      });

      req.on('error', (e) => {
        reject(new Error(`Problem with login request: ${e.message}`));
      });

      req.write(postData);
      req.end();
    });

    return phpSessIdCookie;
  }

  async handleRedirects(
    initialUrl: string,
    cookie: string,
    authSessionCookie: string,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const options = getHeadersWithCookie(cookie);
      let updatedPhpSessIdCookie = '';

      const recursiveRequest = (
        currentUrl: string,
        options: RequestOptions,
      ) => {
        https
          .get(currentUrl, options, (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              const cookies = res.headers['set-cookie'];
              let phpSessIdCookie = '';
              if (cookies) {
                const sessionCookie =
                  cookies.find((cookie) => cookie.startsWith('PHPSESSID')) ||
                  '';
                phpSessIdCookie =
                  sessionCookie.split(';')[0].split('=')[1] || '';

                if (options.headers && phpSessIdCookie) {
                  options.headers.Cookie = `auth_session=${authSessionCookie}; PHPSESSID=${phpSessIdCookie}`;
                  updatedPhpSessIdCookie = phpSessIdCookie;
                }
              }

              // Follow the redirect
              const nextUrl = url.resolve(currentUrl, res.headers.location);
              console.log(`Redirecting to ${nextUrl}`);

              recursiveRequest(nextUrl, options);
            } else if (res.statusCode === 200) {
              // Successfully reached the final destination
              console.log('Final destination reached.');
              console.log(res.url);
              resolve(updatedPhpSessIdCookie);
            } else {
              reject(new Error(`Unexpected status code: ${res.statusCode}`));
            }
          })
          .on('error', (e) => {
            reject(new Error(`Problem with request: ${e.message}`));
          });
      };

      recursiveRequest(initialUrl, options);
    });
  }

  // Function to fetch the file using the session cookie
  async fetchFile(
    fileUrl: string,
    outputFile: string,
    sessionCookie: string,
  ): Promise<string> {
    const options = getHeadersWithCookie(sessionCookie);

    return new Promise<string>((resolve, reject) => {
      const request = https.get(fileUrl, options, async (response) => {
        if (!response || !response.statusCode) {
          throw new Error('No response from the server.');
        }
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          // Handle redirect
          const redirectUrl = url.resolve(fileUrl, response.headers.location);
          console.log(`Redirecting to ${redirectUrl}`);
          const fetchFileResponse = await this.fetchFile(
            redirectUrl,
            outputFile,
            sessionCookie,
          );
          resolve(fetchFileResponse);
        } else if (response.statusCode === 200) {
          const fileStream = fs.createWriteStream(outputFile);
          let csvData = '';

          response.on('data', (chunk) => {
            csvData += chunk;
          });

          response.pipe(fileStream).on('finish', () => {
            fileStream.close();
            console.log('Download completed.');
          });

          response.on('end', () => {
            resolve(csvData);
          });
        } else {
          reject(
            new Error(
              `Failed to fetch file. Status code: ${response.statusCode}`,
            ),
          );
        }
      });

      request.on('error', (err) => {
        reject(new Error(`Request error: ${err.message}`));
      });
    });
  }

  // Usage
  async fetchCsv(
    email: string,
    password: string,
    fileUrl: string,
    authSessionCookie: string,
  ) {
    try {
      if (!email || !password || !fileUrl || !authSessionCookie) {
        throw new Error(
          'One or more of the required environment variables are missing.',
        );
      }
      const phpSessIdCookie = await this.loginAndGetSession(
        email,
        password,
        authSessionCookie,
      );

      if (!phpSessIdCookie) {
        throw new Error('Failed to get PHPSESSID cookie.');
      }

      const combinedCookie = `auth_session=${authSessionCookie}; PHPSESSID=${phpSessIdCookie}`;

      const csv = await this.fetchFile(
        fileUrl,
        this.outputFile,
        combinedCookie,
      );
      console.log('CSV data:', csv);
      // TODO: Start from here with the csv and add it into it's own array of objects
    } catch (error) {
      console.error(error);
    }
  }
}

export default WaterCalculator;
