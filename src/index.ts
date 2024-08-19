import WaterCalculator from './water-calculator';
import GasCalculator from './gas-calculator';
import dotenv from 'dotenv';

dotenv.config();

async function calculatorWaterUtilities() {
  const email = process.env.WATER_UTILITY_EMAIL as string;
  const password = process.env.WATER_UTILITY_PASSWORD as string;
  const fileUrl = process.env.WATER_UTILITY_DOWNLOAD_URL as string;
  const authSessionCookie = process.env
    .WATER_UTILITY_AUTH_SESSION_COOKIE as string;

  const waterCalculator = new WaterCalculator();
  await waterCalculator.fetchCsv(email, password, fileUrl, authSessionCookie);
}

async function calculatorGasUtilities() {
  const gasCalculator = new GasCalculator();
  await gasCalculator.calculate();
}

calculatorWaterUtilities();
// calculatorGasUtilities();
