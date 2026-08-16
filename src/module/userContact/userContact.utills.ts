import { redisClient } from "../../redis/redis.client.js";

export const invalidateContactsCache = async (ownerId: string) => {
  const keys = await redisClient.keys(`contacts:user:${ownerId}*`);
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
};