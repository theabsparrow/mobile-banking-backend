import bcrypt from 'bcryptjs';
import config from '../config/index.js';

export const hashData = async (data: string): Promise<string> => {
  const saltRounds = Number(config.bcrypt_salt_rounds) || 10;
  const hash: string = await bcrypt.hash(data, saltRounds);
  return hash;
};

export const compareData = async (plainText: string, hashedData: string): Promise<boolean> => {
  const isMatched: boolean = await bcrypt.compare(plainText, hashedData);
  return isMatched;
};
