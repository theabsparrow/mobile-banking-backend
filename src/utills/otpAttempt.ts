import { redisClient } from '../redis/redis.client.js';

const MAX_ATTEMPT = 5;
const BLOCK_TIME = 60 * 60 * 24; // 24 hours

export const handleOtpFailedAttempt = async (verificationId: string) => {
  // increase failed attempt count
  const attemptKey = `otp:attempt:${verificationId}`;
  const attempts = await redisClient.incr(attemptKey);

  // first attempt হলে 24 hour expiry set হবে
  if (attempts === 1) {
    await redisClient.expire(attemptKey, BLOCK_TIME);
  }

  return {
    attempts,
    isBlocked: attempts >= MAX_ATTEMPT,
  };
};
