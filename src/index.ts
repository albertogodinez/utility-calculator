import WaterCalculator from './water-calculator';
import dotenv from 'dotenv';

dotenv.config();

function calculatorWaterUtilities() {
  const email = process.env.WATER_UTILITY_EMAIL as string;
  const password = process.env.WATER_UTILITY_PASSWORD as string;
  const fileUrl = process.env.WATER_UTILITY_DOWNLOAD_URL as string;
  const authSessionCookie = process.env
    .WATER_UTILITY_AUTH_SESSION_COOKIE as string;

  const waterCalculator = new WaterCalculator();
  waterCalculator.fetchCsv(email, password, fileUrl, authSessionCookie);
}

calculatorWaterUtilities();
