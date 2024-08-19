import fs from 'fs';
import { google } from 'googleapis';
import csv from 'csv-parser';
import dayjs from 'dayjs';
import dotenv from 'dotenv';
import https, { RequestOptions } from 'https';
import url from 'url';
import querystring from 'querystring';
import {
  getHeadersWithCookie,
  getOptionsWithCalculatedContentLength,
} from './utilities/constants';

dotenv.config();

interface UsageData {
  billDate: string;
  totalUsage: number;
  billAmount: number;
}

const getCredentials = (): any => {
  const credentialsPath = process.env.GOOGLE_API_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error(
      'GOOGLE_API_CREDENTIALS is not defined in the environment variables',
    );
  }
  return JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
};

const authenticateGoogleDrive = async () => {
  const credentials = getCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return await auth.getClient();
};

const fetchFileFromGoogleDrive = async (
  auth: any,
  fileId: string,
): Promise<UsageData[]> => {
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );

  return new Promise((resolve, reject) => {
    const results: UsageData[] = [];
    const parseStream = csv();

    res.data
      .pipe(parseStream)
      .on('data', (data) => {
        results.push({
          billDate: data['Bill Date'],
          totalUsage: parseFloat(data['Total Usage (CCF)']),
          billAmount: parseFloat(data['Bill Amount'].replace('$', '')),
        });
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error: Error) => {
        reject(error);
      });
  });
};

const findClosestDate = (
  targetDate: dayjs.Dayjs,
  dates: dayjs.Dayjs[],
): dayjs.Dayjs | null => {
  let closestDate: dayjs.Dayjs | null = null;
  let minDiff = Infinity;

  dates.forEach((date) => {
    let diff = Math.abs(date.diff(targetDate, 'day'));

    if (targetDate.month() === 1 && targetDate.date() === 29) {
      // target is February 29
      const feb28 = date.month() === 1 && date.date() === 28;
      const mar1 = date.month() === 2 && date.date() === 1;
      if (feb28 || mar1) {
        diff = Math.abs(date.diff(targetDate, 'day'));
      }
    }

    if (diff < minDiff) {
      minDiff = diff;
      closestDate = date;
    }
  });

  return closestDate;
};

const getPreviousYearsClosestDates = (
  data: UsageData[],
  latestBillDate: dayjs.Dayjs,
): UsageData[] => {
  const latestMonthDay = latestBillDate.format('MM-DD');

  const years = new Set(
    data
      .map((row) => dayjs(row.billDate, 'MM-DD-YYYY').year())
      .filter((year) => year < latestBillDate.year()),
  );

  const closestDates: UsageData[] = [];

  years.forEach((year) => {
    const datesInYear = data
      .filter((row) => dayjs(row.billDate, 'MM-DD-YYYY').year() === year)
      .map((row) => dayjs(row.billDate, 'MM-DD-YYYY'));

    const targetDateInYear = dayjs(`${year}-${latestMonthDay}`, 'YYYY-MM-DD');
    const closestDate = findClosestDate(targetDateInYear, datesInYear);

    if (closestDate) {
      console.log(
        `Using the closest date for year ${year}: ${closestDate.format('MM-DD-YYYY')}`,
      );
      const closestRow = data.find((row) =>
        dayjs(row.billDate, 'MM-DD-YYYY').isSame(closestDate),
      );
      if (closestRow) {
        closestDates.push(closestRow);
      }
    }
  });

  return closestDates;
};

const getAverageCcf = (data: UsageData[]): number => {
  if (data.length === 0) return 0;
  const total = data.reduce((acc, d) => acc + d.totalUsage, 0);
  return total / data.length;
};

const main = async () => {
  try {
    const auth = await authenticateGoogleDrive();
    const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
    if (!fileId) {
      throw new Error(
        'GOOGLE_DRIVE_FILE_ID is not defined in the environment variables',
      );
    }

    const usageData = await fetchFileFromGoogleDrive(auth, fileId);
    console.log('Fetched CSV data from Google Drive.');

    if (usageData.length === 0) {
      console.log('No data available.');
      return;
    }
    // todo: instead of calling google drive, we should be calling the correct API endpoint per client
    // i.e MyATXWater, CoaUtilities, etc.
    // https://www.geeksforgeeks.org/how-to-make-http-requests-in-node-js/
    // i recommend using approach 4 (HTTP Module) to call
    // https://austintx.watersmart.com/index.php/direct/to/dest/download_consumption
    // with the cookies that I will send in an email
    // !! The previous logic won't really be used, we can start looking at the logic below
    // Get the latest billing date
    const latestBillDateStr = usageData[0].billDate;
    const latestBillDate = dayjs(latestBillDateStr, 'MM-DD-YYYY');

    // Get previous years' closest dates data for the latest billing date
    const previousYearsData = getPreviousYearsClosestDates(
      usageData,
      latestBillDate,
    );

    // Calculate average CCF for previous years' data
    const averagePreviousCcf = getAverageCcf(previousYearsData);

    // Get current month's data
    const currentMonthData = usageData[0];
    const currentMonthUsage = currentMonthData.totalUsage;
    const currentMonthBillAmount = currentMonthData.billAmount;

    // Calculate the difference
    const difference = currentMonthUsage - averagePreviousCcf;

    // Calculate the price per CCF for the current month
    const pricePerCcf = currentMonthBillAmount / currentMonthUsage;

    // Calculate the additional cost based on the difference
    const additionalCost = difference * pricePerCcf;

    console.log(
      `Average CCF for previous years' ${latestBillDate.format('MMMM')}: ${averagePreviousCcf}`,
    );
    console.log(
      `Total CCF for the current ${latestBillDate.format('MMMM')}: ${currentMonthUsage}`,
    );
    console.log(`Difference in CCF: ${difference}`);
    console.log(
      `Price per CCF for the current month: $${pricePerCcf.toFixed(2)}`,
    );
    console.log(
      `Additional cost based on the difference: $${additionalCost.toFixed(2)}`,
    );
  } catch (error) {
    console.error('Error fetching CSV data from Google Drive:', error);
  }
};

// main();

// Function to perform login and get session cookies
async function loginAndGetSession(
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

  return new Promise<string>((resolve, reject) => {
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

        // Handle initial redirect
        const redirectUrl = url.resolve(
          `https://${options.hostname}${options.path}`,
          res.headers.location,
        );
        console.log(`First redirect is to ${redirectUrl}`);

        const updatedPhpSessIdCookie = await handleRedirects(
          redirectUrl,
          cookiesString,
          authSessionCookie,
        );

        phpSessIdCookie = updatedPhpSessIdCookie
          ? updatedPhpSessIdCookie
          : phpSessIdCookie;

        if (phpSessIdCookie) {
          resolve(phpSessIdCookie);
        } else {
          reject(new Error('No PHPSESSID cookie found in the response'));
        }
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
}

async function handleRedirects(
  initialUrl: string,
  cookie: string,
  authSessionCookie: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const options: RequestOptions = {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        DNT: '1',
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
        Cookie: cookie,
      },
    };
    let updatedPhpSessIdCookie = '';

    const recursiveRequest = (currentUrl: string, options: RequestOptions) => {
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
                cookies.find((cookie) => cookie.startsWith('PHPSESSID')) || '';
              phpSessIdCookie = sessionCookie.split(';')[0].split('=')[1] || '';
              console.log(`phpSessIdCookie cookie: ${phpSessIdCookie}`);
              if (options.headers && phpSessIdCookie) {
                options.headers.Cookie = `auth_session=${authSessionCookie}; PHPSESSID=${phpSessIdCookie}`;
                console.log('updated options:', options);
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
async function fetchFile(
  fileUrl: string,
  outputFile: string,
  sessionCookie: string,
): Promise<void> {
  const options = getHeadersWithCookie(sessionCookie);

  return new Promise<void>((resolve, reject) => {
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
        await fetchFile(redirectUrl, outputFile, sessionCookie);
        resolve();
      } else if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(outputFile);

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log('Download completed.');
          resolve();
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
async function waterUtilitiesInit() {
  try {
    const email = process.env.WATER_UTILITY_EMAIL as string;
    const password = process.env.WATER_UTILITY_PASSWORD as string;
    const fileUrl = process.env.WATER_UTILITY_DOWNLOAD_URL as string;
    const authSessionCookie = process.env
      .WATER_UTILITY_AUTH_SESSION_COOKIE as string;

    if (!email || !password || !fileUrl || !authSessionCookie) {
      throw new Error(
        'One or more of the required environment variables are missing.',
      );
    }

    const outputFile = 'download.csv';

    const phpSessIdCookie = await loginAndGetSession(
      email,
      password,
      authSessionCookie,
    );
    console.log('phpSessIdCookie cookie:', phpSessIdCookie);

    if (!phpSessIdCookie) {
      throw new Error('Failed to get PHPSESSID cookie.');
    }

    const combinedCookie = `auth_session=${authSessionCookie}; PHPSESSID=${phpSessIdCookie}`;
    console.log('Combined cookie:', combinedCookie);

    await fetchFile(fileUrl, outputFile, combinedCookie);
  } catch (error) {
    console.error(error);
  }
}

waterUtilitiesInit();
