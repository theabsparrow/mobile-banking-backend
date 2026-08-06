import { redisClient } from '../redis/redis.client.js';

export const setPinSession = async (pinSetId: string, userId: string) => {
  await redisClient.set(
    `pin:setup:${pinSetId}`,
    JSON.stringify({
      userId,
    }),
    {
      EX: 600, // 10 minutes
    }
  );
};
