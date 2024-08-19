import { google } from 'googleapis';
import csv from 'csv-parser';
import dayjs from 'dayjs';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

interface UsageData {
  billDate: string;
  totalUsage: number;
  billAmount: number;
}

class GasCalculator {
  private auth: any;

  constructor() {}

  private getCredentials(): any {
    const credentialsPath = process.env.GOOGLE_API_CREDENTIALS;
    if (!credentialsPath) {
      throw new Error(
        'GOOGLE_API_CREDENTIALS is not defined in the environment variables',
      );
    }
    return JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  }

  private async authenticateGoogleDrive() {
    const credentials = this.getCredentials();
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    this.auth = await auth.getClient();
  }

  private async fetchFileFromGoogleDrive(fileId: string): Promise<UsageData[]> {
    const drive = google.drive({ version: 'v3', auth: this.auth });

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
  }

  private findClosestDate(
    targetDate: dayjs.Dayjs,
    dates: dayjs.Dayjs[],
  ): dayjs.Dayjs | null {
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
  }

  private getPreviousYearsClosestDates(
    data: UsageData[],
    latestBillDate: dayjs.Dayjs,
  ): UsageData[] {
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
      const closestDate = this.findClosestDate(targetDateInYear, datesInYear);

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
  }

  private getAverageCcf(data: UsageData[]): number {
    if (data.length === 0) return 0;
    const total = data.reduce((acc, d) => acc + d.totalUsage, 0);
    return total / data.length;
  }

  public async calculate() {
    try {
      await this.authenticateGoogleDrive();
      const fileId = process.env.GOOGLE_DRIVE_FILE_ID;
      if (!fileId) {
        throw new Error(
          'GOOGLE_DRIVE_FILE_ID is not defined in the environment variables',
        );
      }

      const usageData = await this.fetchFileFromGoogleDrive(fileId);
      console.log('Fetched CSV data from Google Drive.');

      if (usageData.length === 0) {
        console.log('No data available.');
        return;
      }

      // Get the latest billing date
      const latestBillDateStr = usageData[0].billDate;
      const latestBillDate = dayjs(latestBillDateStr, 'MM-DD-YYYY');

      // Get previous years' closest dates data for the latest billing date
      const previousYearsData = this.getPreviousYearsClosestDates(
        usageData,
        latestBillDate,
      );

      // Calculate average CCF for previous years' data
      const averagePreviousCcf = this.getAverageCcf(previousYearsData);

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
  }
}

export default GasCalculator;
