import { redisClient } from '../redis/redis.client.js';

export const clearOtpSession = async (verificationId: string) => {
  await redisClient.del([
    `otp:verification:${verificationId}`,
    `verification:session:${verificationId}`,
    `otp:attempt:${verificationId}`,
  ]);
};

export const clearPinSession = async (pinSetId: string) => {
  await redisClient.del(`pin:setup:${pinSetId}`);
};
