import bcrypt from 'bcryptjs';
import config from '../config/index.js';

export const hashData = async (data: string): Promise<string> => {
  const hash: string = await bcrypt.hash(data, config.bcrypt_salt_rounds as string);
  return hash;
};

export const compareData = async (plainText: string, hashedData: string): Promise<boolean> => {
  const isMatched: boolean = await bcrypt.compare(plainText, hashedData);
  return isMatched;
};
