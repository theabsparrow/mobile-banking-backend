/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { redisClient } from '../../redis/redis.client.js';
import type { TCreateContact } from './userContact.interface.js';
import { invalidateContactsCache } from './userContact.utills.js';
import { QueryBuilder } from '../../builder/QueryBuilder.js';
import type { TQuery } from '../user/user.interface.js';

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
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          name: true,
        },
      },
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
      customName: customName ?? targetUser?.profile?.name ?? targetUser?.email.split('@')[0] ?? '',
    },
    include: {
      savedUser: {
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          profile: {
            select: {
              name: true,
              image: true,
              address: true,
            },
          },
        },
      },
    },
  });

  // Invalidate cache
  await invalidateContactsCache(ownerId);
  return contact;
};

const getContacts = async (ownerId: string, query: TQuery) => {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const cacheKey = `contacts:user:${ownerId}:${search}`;
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const queryBuilder = new QueryBuilder(query).search(['customName']);

  const where = queryBuilder.getWhere() as any;
  where.ownerId = ownerId;

  if (search) {
    if (!where.OR) {
      where.OR = [];
    }
    where.OR.push(
      {
        savedUser: {
          email: { contains: search, mode: 'insensitive' },
        },
      },
      {
        savedUser: {
          phone: { contains: search, mode: 'insensitive' },
        },
      }
    );
  }

  const contacts = await prisma.userContact.findMany({
    where,
    orderBy: {
      customName: 'asc',
    },
    include: {
      savedUser: {
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          profile: {
            select: {
              name: true,
              image: true,
              address: true,
            },
          },
        },
      },
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
          email: true,
          phone: true,
          role: true,
          profile: {
            select: {
              name: true,
              image: true,
              address: true,
            },
          },
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

const updateContact = async (ownerId: string, id: string, payload: Partial<TCreateContact>) => {
  const { savedUserId } = payload;
  const contact = await prisma.userContact.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      ownerId: true,
      savedUserId: true,
    },
  });

  if (!contact) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Contact not found.');
  }

  if (contact.ownerId !== ownerId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'You do not have permission to update this contact.');
  }

  if (savedUserId === ownerId) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'You cannot save yourself as a contact.');
  }

  if (savedUserId) {
    const user = await prisma.user.findUnique({
      where: {
        id: savedUserId,
      },
      select: {
        id: true,
        isVerified: true,
        status: true,
      },
    });
    if (!user) {
      throw new AppError(StatusCodes.FORBIDDEN, 'You cannot add this user as a contact.');
    }

    if (!user?.isVerified || user?.status !== 'ACTIVE') {
      throw new AppError(StatusCodes.FORBIDDEN, 'You cannot add this user as a contact.');
    }
  }

  const updatedContact = await prisma.userContact.update({
    where: {
      id,
    },
    data: payload,
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
