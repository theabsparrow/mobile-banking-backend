import { redisClient } from '../redis/redis.client.js';

export const setPinSession = async ({ userId, time = 600 }: { userId: string; time?: number }) => {
  const pinSetId = crypto.randomUUID();
  await redisClient.set(
    `pin:setup:${pinSetId}`,
    JSON.stringify({
      userId,
    }),
    {
      EX: time, // 10 minutes
    }
  );

  return pinSetId;
};

export const passwordReset = async (userId: string) => {
  const passwordResetId = crypto.randomUUID();
  await redisClient.set(
    `password:reset:${passwordResetId}`,
    JSON.stringify({
      userId,
    }),
    {
      EX: 300, // 5 minutes
    }
  );

  return passwordResetId;
};
