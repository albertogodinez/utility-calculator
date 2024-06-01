import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import dayjs from 'dayjs';
import dotenv from 'dotenv';

dotenv.config();

interface UsageData {
  billDate: string;
  totalUsage: number;
  billAmount: number;
}

const getCsvFilePath = (): string => {
  const csvFilePath = process.env.GAS_DATA_PATH;
  if (!csvFilePath) {
    throw new Error(
      'GAS_DATA_PATH is not defined in the environment variables',
    );
  }
  return path.resolve(process.cwd(), csvFilePath); // Use process.cwd() to resolve the path from the project root
};

const readCsvData = (filePath: string): Promise<UsageData[]> => {
  return new Promise((resolve, reject) => {
    const results: UsageData[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        results.push({
          billDate: data['Bill Date'],
          totalUsage: parseFloat(data['Total Usage (CCF)']),
          billAmount: parseFloat(data['Bill Amount'].replace('$', '')),
        });
      })
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
};
const getPreviousMonthAndYear = (): { month: string; year: string } => {
  const now = dayjs();
  const previousMonth = now.subtract(1, 'month');
  return {
    month: previousMonth.format('MM'),
    year: previousMonth.format('YYYY'),
  };
};

const getCurrentMonthAndYear = (): { month: string; year: string } => {
  const now = dayjs();
  return { month: now.format('MM'), year: now.format('YYYY') };
};

const filterPreviousYearsDataForCurrentMonth = (
  data: UsageData[],
  currentMonth: string,
  currentYear: string,
): UsageData[] => {
  return data.filter((row) => {
    const rowMonth = dayjs(row.billDate, 'MM-DD-YYYY').format('MM');
    const rowYear = dayjs(row.billDate, 'MM-DD-YYYY').format('YYYY');
    return rowMonth === currentMonth && rowYear !== currentYear;
  });
};

const filterCurrentMonthData = (
  data: UsageData[],
  currentMonth: string,
  currentYear: string,
): UsageData | null => {
  return (
    data.find((row) => {
      const rowMonth = dayjs(row.billDate, 'MM-DD-YYYY').format('MM');
      const rowYear = dayjs(row.billDate, 'MM-DD-YYYY').format('YYYY');
      return rowMonth === currentMonth && rowYear === currentYear;
    }) || null
  );
};

const getAverageCcf = (data: UsageData[]): number => {
  if (data.length === 0) return 0;
  const total = data.reduce((acc, d) => acc + d.totalUsage, 0);
  return total / data.length;
};

const main = async () => {
  try {
    const filePath = getCsvFilePath();
    console.log(`Reading CSV data from: ${filePath}`);
    const usageData = await readCsvData(filePath);

    // TODO: Uncomment the following once I have data for current month
    // const { month: currentMonth, year: currentYear } = getCurrentMonthAndYear();
    const { month: currentMonth, year: currentYear } =
      getPreviousMonthAndYear();

    // Get previous years' data for the current month
    const previousYearsData = filterPreviousYearsDataForCurrentMonth(
      usageData,
      currentMonth,
      currentYear,
    );

    // Calculate average CCF for previous years' data for the current month
    const averagePreviousCcf = getAverageCcf(previousYearsData);

    // Get current month's data
    const currentMonthData = filterCurrentMonthData(
      usageData,
      currentMonth,
      currentYear,
    );
    if (!currentMonthData) {
      console.log('No data available for the current month.');
      return;
    }

    const currentMonthUsage = currentMonthData.totalUsage;
    const currentMonthBillAmount = currentMonthData.billAmount;

    // Calculate the difference
    const difference = currentMonthUsage - averagePreviousCcf;

    // Calculate the price per CCF for the current month
    const pricePerCcf = currentMonthBillAmount / currentMonthUsage;

    // Calculate the amount due cost based on the difference
    const amountDue = difference * pricePerCcf;

    console.log(
      `Average CCF for previous years' ${dayjs().format('MMMM')}: ${averagePreviousCcf}`,
    );
    console.log(
      `Total CCF for the current ${dayjs().format('MMMM')}: ${currentMonthUsage}`,
    );
    console.log(`Difference in CCF: ${difference}`);
    console.log(
      `Price per CCF for the current month: $${pricePerCcf.toFixed(2)}`,
    );
    console.log(
      `Amount cost based on the difference: $${amountDue.toFixed(2)}`,
    );
  } catch (error) {
    console.error('Error reading CSV data:', error);
  }
};

main();
