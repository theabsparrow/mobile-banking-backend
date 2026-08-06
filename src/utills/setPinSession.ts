import { redisClient } from '../redis/redis.client.js';

export const setPinSession = async (userId: string) => {
  const pinSetId = crypto.randomUUID();
  await redisClient.set(
    `pin:setup:${pinSetId}`,
    JSON.stringify({
      userId,
    }),
    {
      EX: 600, // 10 minutes
    }
  );

  return pinSetId;
};
