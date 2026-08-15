import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { redisClient } from '../../redis/redis.client.js';
import type { TCreateContact } from './userContact.interface.js';

const invalidateContactsCache = async (ownerId: string) => {
  await redisClient.del(`contacts:user:${ownerId}`);
};

const createContact = async (ownerId: string, payload: TCreateContact) => {
  const { savedUserId, customName } = payload;

  if (ownerId === savedUserId) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'You cannot save yourself as a contact.');
  }

  // Check if target user exists
  const targetUser = await prisma.user.findUnique({
    where: {
      id: savedUserId,
    },
  });

  if (!targetUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'The user you are trying to add does not exist.');
  }

  // Check if contact already exists
  const existingContact = await prisma.userContact.findUnique({
    where: {
      ownerId_savedUserId: {
        ownerId,
        savedUserId,
      },
    },
  });

  if (existingContact) {
    throw new AppError(StatusCodes.CONFLICT, 'This user is already in your contact list.');
  }

  const contact = await prisma.userContact.create({
    data: {
      ownerId,
      savedUserId,
      customName: customName ?? null,
    },
    include: {
      savedUser: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          role: true,
        },
      },
    },
  });

  // Invalidate cache
  await invalidateContactsCache(ownerId);

  return contact;
};

const getContacts = async (ownerId: string) => {
  const cacheKey = `contacts:user:${ownerId}`;
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(cached);
  }

  const contacts = await prisma.userContact.findMany({
    where: {
      ownerId,
    },
    include: {
      savedUser: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          role: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Cache for 1 hour
  await redisClient.set(cacheKey, JSON.stringify(contacts), {
    EX: 3600,
  });

  return contacts;
};

const getContactById = async (ownerId: string, contactId: string) => {
  const contact = await prisma.userContact.findUnique({
    where: {
      id: contactId,
    },
    include: {
      savedUser: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          role: true,
        },
      },
    },
  });

  if (!contact) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Contact not found.');
  }

  if (contact.ownerId !== ownerId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'You do not have permission to access this contact.');
  }

  return contact;
};

const updateContact = async (ownerId: string, contactId: string, payload: Partial<TCreateContact>) => {

  const contact = await prisma.userContact.findUnique({
    where: {
      id: contactId,
    },
  });

  if (!contact) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Contact not found.');
  }

  if (contact.ownerId !== ownerId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'You do not have permission to update this contact.');
  }

  const updatedContact = await prisma.userContact.update({
    where: {
      id: contactId,
    },
    data: payload,
    include: {
      savedUser: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          role: true,
        },
      },
    },
  });

  // Invalidate cache
  await invalidateContactsCache(ownerId);

  return updatedContact;
};

const deleteContact = async (ownerId: string, contactId: string) => {
  const contact = await prisma.userContact.findUnique({
    where: {
      id: contactId,
    },
  });

  if (!contact) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Contact not found.');
  }

  if (contact.ownerId !== ownerId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'You do not have permission to delete this contact.');
  }

  await prisma.userContact.delete({
    where: {
      id: contactId,
    },
  });

  // Invalidate cache
  await invalidateContactsCache(ownerId);

  return null;
};

export const userContactService = {
  createContact,
  getContacts,
  getContactById,
  updateContact,
  deleteContact,
};
