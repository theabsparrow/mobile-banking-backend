/* eslint-disable @typescript-eslint/no-explicit-any */
import { RequestStatus, Role } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { getIO } from '../../socket/server.js';
import { invalidateAuthUserCache, type TJwtPayload } from '../auth/auth.utills.js';
import type { TProcessRequestInput, TCreateRequest, TRequest } from './request.interface.js';
import { verifyUserPin } from '../../utills/verifyPin.js';
import { QueryBuilder } from '../../builder/QueryBuilder.js';
import type { TQuery } from '../user/user.interface.js';
import { transactionService } from '../transaction/transaction.service.js';

// cretae business request
const createBusinessRequest = async (id: string, payload: TCreateRequest) => {
  const { amount, reason, pin } = payload;
  const isPinVerified = await verifyUserPin(id, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }
  const request = await prisma.request.create({
    data: {
      requesterId: id,
      amount,
      reason,
    },
  });
  return request;
};

// create personal request
const createPersonalRequest = async (id: string, payload: TCreateRequest) => {
  const { amount, reason, pin, receiverId } = payload;
  if (id === receiverId) {
    throw new AppError(StatusCodes.CONFLICT, 'you can`t req to yourself');
  }
  const isPinVerified = await verifyUserPin(id, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }
  const request = await prisma.request.create({
    data: {
      requesterId: id,
      receiverId: receiverId as string,
      amount,
      reason,
    },
  });
  return request;
};

// get requests - accessible only by SUPER_ADMIN with search, filtering, and pagination
const getRequests = async (query: TQuery) => {
  const queryBuilder = new QueryBuilder(query).filter(['status']).sort('createdAt').paginate();

  const where = queryBuilder.getWhere() as any;

  // Agent requests to admin have no specific receiver
  where.receiverId = null;

  // 1. Status Filter: support single or comma-separated statuses
  if (query.status && typeof query.status === 'string') {
    if (query.status.includes(',')) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) =>
          Object.values(RequestStatus).includes(s as RequestStatus)
        ) as RequestStatus[];
      if (statuses.length > 0) {
        where.status = { in: statuses };
      }
    } else {
      const normalizedStatus = query.status.trim().toUpperCase();
      if (Object.values(RequestStatus).includes(normalizedStatus as RequestStatus)) {
        where.status = normalizedStatus as RequestStatus;
      }
    }
  }

  // 2. Single Frontend Search Field: searches by Agent (name, email, phone) or Admin (name, email, phone)
  if (query.search) {
    const searchTerm = String(query.search).trim();
    where.OR = [
      // Agent (requester) who created the request: name, email, phone
      {
        requester: {
          profile: {
            name: { contains: searchTerm, mode: 'insensitive' },
          },
        },
      },
      {
        requester: {
          email: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      {
        requester: {
          phone: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      // Admin (processedBy) who accepted or rejected the request: name, email, phone
      {
        processedBy: {
          profile: {
            name: { contains: searchTerm, mode: 'insensitive' },
          },
        },
      },
      {
        processedBy: {
          email: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      {
        processedBy: {
          phone: { contains: searchTerm, mode: 'insensitive' },
        },
      },
    ];
  }

  // 3. Pagination & Database Query
  const skip = queryBuilder.getSkip();
  const take = queryBuilder.getTake();
  const orderBy = queryBuilder.getOrderBy();

  const [requests, total] = await prisma.$transaction([
    prisma.request.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        requester: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            profile: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
        processedBy: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            profile: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
      },
    }),
    prisma.request.count({ where }),
  ]);

  return {
    meta: queryBuilder.getPaginationMeta(total),
    data: requests,
  };
};

// get agent requests for admin - only pending and cancelled requests from agents to admin
const getAgentRequests = async (query: TQuery) => {
  const queryBuilder = new QueryBuilder(query).sort('createdAt').paginate();

  const where = queryBuilder.getWhere() as any;
  where.receiverId = null;
  where.requester = {
    role: Role.AGENT,
  };

  // Status Filter: By default shows PENDING & CANCELLED requests. Admin can filter by PENDING or CANCELLED.
  const defaultStatuses: RequestStatus[] = [RequestStatus.PENDING, RequestStatus.CANCELLED];
  if (query.status && typeof query.status === 'string') {
    const rawStatus = query.status.trim().toUpperCase();

    if (rawStatus === 'PENDING') {
      where.status = RequestStatus.PENDING;
    } else if (rawStatus === 'CANCELLED') {
      where.status = RequestStatus.CANCELLED;
    } else if (rawStatus.includes(',')) {
      const parsedStatuses = rawStatus
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => defaultStatuses.includes(s as RequestStatus)) as RequestStatus[];

      where.status = parsedStatuses.length > 0 ? { in: parsedStatuses } : { in: defaultStatuses };
    } else {
      where.status = { in: defaultStatuses };
    }
  } else {
    where.status = { in: defaultStatuses };
  }

  if (query.search) {
    const searchTerm = String(query.search).trim();
    where.OR = [
      {
        requester: {
          profile: {
            name: { contains: searchTerm, mode: 'insensitive' },
          },
        },
      },
      {
        requester: {
          email: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      {
        requester: {
          phone: { contains: searchTerm, mode: 'insensitive' },
        },
      },
    ];
  }

  // Pagination & Database Query
  const skip = queryBuilder.getSkip();
  const take = queryBuilder.getTake();
  const orderBy = queryBuilder.getOrderBy();

  const [requests, total] = await prisma.$transaction([
    prisma.request.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        requester: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            profile: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
      },
    }),
    prisma.request.count({ where }),
  ]);

  return {
    meta: queryBuilder.getPaginationMeta(total),
    data: requests,
  };
};

// get my requests - user sees the requests they have made, filterable by status, searchable by processedBy or receiver, with pagination
const getMyRequests = async (userId: string, query: TQuery) => {
  const queryBuilder = new QueryBuilder(query).sort('createdAt').paginate();
  const where = queryBuilder.getWhere() as any;
  where.requesterId = userId;

  // 1. Filter by status: PENDING, APPROVED, REJECTED, CANCELLED
  if (query.status && typeof query.status === 'string') {
    if (query.status.includes(',')) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) =>
          Object.values(RequestStatus).includes(s as RequestStatus)
        ) as RequestStatus[];
      if (statuses.length > 0) {
        where.status = { in: statuses };
      }
    } else {
      const normalizedStatus = query.status.trim().toUpperCase();
      if (Object.values(RequestStatus).includes(normalizedStatus as RequestStatus)) {
        where.status = normalizedStatus as RequestStatus;
      }
    }
  }

  // 2. Search by who processed it (processedBy) or who it was sent to (receiver)
  if (query.search) {
    const searchTerm = String(query.search).trim();
    where.OR = [
      {
        processedBy: {
          profile: {
            name: { contains: searchTerm, mode: 'insensitive' },
          },
        },
      },
      {
        processedBy: {
          email: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      {
        processedBy: {
          phone: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      // Who the request was sent to (receiver)
      {
        receiver: {
          profile: {
            name: { contains: searchTerm, mode: 'insensitive' },
          },
        },
      },
      {
        receiver: {
          email: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      {
        receiver: {
          phone: { contains: searchTerm, mode: 'insensitive' },
        },
      },
    ];
  }

  // 3. Pagination & Database Query
  const skip = queryBuilder.getSkip();
  const take = queryBuilder.getTake();
  const orderBy = queryBuilder.getOrderBy();

  const [requests, total] = await prisma.$transaction([
    prisma.request.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        receiver: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            profile: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
        processedBy: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            profile: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
      },
    }),
    prisma.request.count({ where }),
  ]);

  return {
    meta: queryBuilder.getPaginationMeta(total),
    data: requests,
  };
};

// get received requests - user sees requests sent to them (where receiverId is their userId)
const getReceivedRequests = async (userId: string, query: TQuery) => {
  const queryBuilder = new QueryBuilder(query).sort('createdAt').paginate();

  const where = queryBuilder.getWhere() as any;
  where.receiverId = userId;
  if (query.status && typeof query.status === 'string') {
    if (query.status.includes(',')) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) =>
          Object.values(RequestStatus).includes(s as RequestStatus)
        ) as RequestStatus[];
      if (statuses.length > 0) {
        where.status = { in: statuses };
      }
    } else {
      const normalizedStatus = query.status.trim().toUpperCase();
      if (Object.values(RequestStatus).includes(normalizedStatus as RequestStatus)) {
        where.status = normalizedStatus as RequestStatus;
      }
    }
  }

  if (query.search) {
    const searchTerm = String(query.search).trim();
    where.OR = [
      {
        requester: {
          profile: {
            name: { contains: searchTerm, mode: 'insensitive' },
          },
        },
      },
      {
        requester: {
          email: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      {
        requester: {
          phone: { contains: searchTerm, mode: 'insensitive' },
        },
      },
    ];
  }

  // 3. Pagination & Database Query
  const skip = queryBuilder.getSkip();
  const take = queryBuilder.getTake();
  const orderBy = queryBuilder.getOrderBy();

  const [requests, total, pendingCount] = await prisma.$transaction([
    prisma.request.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        requester: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            profile: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
      },
    }),
    prisma.request.count({ where }),
    prisma.request.count({
      where: {
        receiverId: userId,
        status: RequestStatus.PENDING,
      },
    }),
  ]);

  return {
    meta: {
      ...queryBuilder.getPaginationMeta(total),
      pendingCount,
    },
    data: requests,
  };
};

// get processed requests - user sees requests they have processed (approved or rejected)
const getProcessedRequests = async (userId: string, query: TQuery) => {
  const queryBuilder = new QueryBuilder(query).sort('processedAt').paginate();

  const where = queryBuilder.getWhere() as any;
  where.processedById = userId;

  // Status Filter: By default shows APPROVED & REJECTED. Can be filtered by APPROVED or REJECTED
  const defaultStatuses: RequestStatus[] = [RequestStatus.APPROVED, RequestStatus.REJECTED];
  if (query.status && typeof query.status === 'string') {
    const rawStatus = query.status.trim().toUpperCase();

    if (rawStatus === 'APPROVED' || rawStatus === 'ACCEPTED') {
      where.status = RequestStatus.APPROVED;
    } else if (rawStatus === 'REJECTED') {
      where.status = RequestStatus.REJECTED;
    } else if (rawStatus.includes(',')) {
      const parsedStatuses = rawStatus
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .map((s) => (s === 'ACCEPTED' ? 'APPROVED' : s))
        .filter((s) => defaultStatuses.includes(s as RequestStatus)) as RequestStatus[];

      where.status = parsedStatuses.length > 0 ? { in: parsedStatuses } : { in: defaultStatuses };
    } else {
      where.status = { in: defaultStatuses };
    }
  } else {
    // By default: shows both APPROVED and REJECTED
    where.status = { in: defaultStatuses };
  }

  // Search by Requester (who made the request: name, email, phone) or reason / notes
  if (query.search) {
    const searchTerm = String(query.search).trim();
    where.OR = [
      {
        requester: {
          profile: {
            name: { contains: searchTerm, mode: 'insensitive' },
          },
        },
      },
      {
        requester: {
          email: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      {
        requester: {
          phone: { contains: searchTerm, mode: 'insensitive' },
        },
      },
    ];
  }

  // Pagination & Database Query
  const skip = queryBuilder.getSkip();
  const take = queryBuilder.getTake();
  const orderBy = queryBuilder.getOrderBy();

  const [requests, total] = await prisma.$transaction([
    prisma.request.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        requester: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            profile: {
              select: {
                name: true,
                image: true,
              },
            },
          },
        },
      },
    }),
    prisma.request.count({ where }),
  ]);

  return {
    meta: queryBuilder.getPaginationMeta(total),
    data: requests,
  };
};

// get requests by id
const getRequestById = async (userId: string, role: Role, id: string) => {
  const request = await prisma.request.findUnique({
    where: {
      id,
    },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  // Super Admin can see any request
  if (role === Role.SUPER_ADMIN) {
    return request;
  }

  // Admin access
  const userAccess =
    request.requesterId === userId ||
    request.receiverId === userId ||
    request.processedById === userId;

  const hasAccess =
    role === Role.ADMIN
      ? userAccess ||
        request.status === RequestStatus.PENDING ||
        request.status === RequestStatus.CANCELLED
      : userAccess;
  if (!hasAccess) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Access denied.');
  }
  return request;
};

// cancell request
const cancelRequest = async (userId: string, id: string, payload: TRequest) => {
  const { pin } = payload;

  // 1. Verify PIN
  const isPinVerified = await verifyUserPin(userId, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Only pending requests can be cancelled.');
  }

  if (request.requesterId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only the requester can cancel this request.');
  }

  const result = await prisma.request.update({
    where: { id },
    data: {
      status: 'CANCELLED',
    },
  });

  return result;
};

// delete request
const deleteRequest = async (userId: string, id: string, payload: TRequest) => {
  const { pin } = payload;

  // 1. Verify PIN
  const isPinVerified = await verifyUserPin(userId, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.requesterId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only the requester can delete this request.');
  }

  await prisma.request.delete({
    where: { id },
  });
  return null;
};

// reject request
const rejectRequest = async (userId: string, id: string, payload: TRequest) => {
  const { pin, rejectionReason } = payload;
  // 1. Verify PIN
  const isPinVerified = await verifyUserPin(userId, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id },
    select: {
      receiverId: true,
      status: true,
    },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Only pending requests can be rejected.');
  }

  if (request?.receiverId && request?.receiverId !== userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'You can`t reject this request');
  }

  const updatedRequest = await prisma.request.update({
    where: { id },
    data: {
      status: 'REJECTED',
      processedById: userId,
      processedAt: new Date(),
      rejectionReason: rejectionReason ?? null,
    },
  });
  return updatedRequest;
};

// approve business request (Agent -> Admin, executes CASH_IN with 0 fee)
const approveBusinessRequest = async (
  user: TJwtPayload,
  requestId: string,
  payload: TProcessRequestInput
) => {
  const { pin, adminNote } = payload;
  const { userId, userRole } = user;

  // 1. Verify PIN
  const isPinVerified = await verifyUserPin(userId, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }

  const isAdmin = userRole === Role.ADMIN || userRole === Role.SUPER_ADMIN;
  if (!isAdmin) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only admin can approve business requests.');
  }

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      requester: {
        select: {
          id: true,
          role: true,
          phone: true,
          profile: { select: { name: true } },
        },
      },
    },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request?.status !== 'PENDING') {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Only pending requests can be approved.');
  }

  if (request?.receiverId) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'This is a personal request, not a business request.');
  }

  const amount = Number(request.amount);

  // 3. Admin float approval: executes CASH_IN with 0 fee, no admin wallet balance check
  const result = await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        processedById: userId,
        processedAt: new Date(),
        adminNote: adminNote ?? null,
      },
    });
    const transferResult = await transactionService.executeCashInTransfer(
      {
        senderId: userId,
        receiverId: request.requesterId,
        amount,
        description: adminNote || 'Agent float approved',
        checkBalance: false,
      },
      tx
    );

    // 3.3 Link transactionId
    const updatedRequest = await tx.request.update({
      where: { id: requestId },
      data: {
        transactionId: transferResult.transaction.id,
      },
      include: {
        requester: {
          select: {
            id: true,
            role: true,
            phone: true,
            profile: { select: { name: true } },
          },
        },
        receiver: {
          select: {
            id: true,
            role: true,
            phone: true,
            profile: { select: { name: true } },
          },
        },
        processedBy: {
          select: {
            id: true,
            role: true,
            phone: true,
            profile: { select: { name: true } },
          },
        },
        transaction: true,
      },
    });

    return {
      request: updatedRequest,
      transaction: transferResult.transaction,
      senderBalance: transferResult.senderBalance,
      receiverBalance: transferResult.receiverBalance,
    };
  });

  // 4. Invalidate caches
  await invalidateAuthUserCache(userId);
  await invalidateAuthUserCache(request?.requesterId);

  // 5. Real-time Socket.IO notifications
  const io = getIO();
  io.to(request.requesterId).emit('money-request-approved', result.request);
  io.to(request.requesterId).emit('balance-updated', { balance: result.receiverBalance });
  io.to(request.requesterId).emit('notification', {
    message: `Your business float request for BDT ${amount} has been approved.`,
  });
  io.to(userId).emit('balance-updated', { balance: result.senderBalance });

  return result;
};

// approve personal request (User -> User, executes SEND_MONEY with charge/fee from sender)
const approvePersonalRequest = async (
  user: TJwtPayload,
  requestId: string,
  payload: TProcessRequestInput
) => {
  const { pin, adminNote } = payload;
  const { userId } = user;

  // 1. Verify PIN
  const isPinVerified = await verifyUserPin(userId, pin);
  if (!isPinVerified) {
    throw new AppError(StatusCodes.FORBIDDEN, 'incorrect pin.');
  }

  // 2. Find request
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      requester: {
        select: {
          id: true,
          role: true,
          phone: true,
          profile: { select: { name: true } },
        },
      },
    },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Only pending requests can be approved.');
  }

  if (!request.receiverId) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'This is a business request, not a personal request.');
  }

  if (request.receiverId !== userId) {
    throw new AppError(StatusCodes.FORBIDDEN, 'You do not have permission to approve this request.');
  }

  const amount = Number(request.amount);
  const fee = transactionService.SEND_MONEY_FEE;
  const totalRequiredBalance = amount + fee;

  // 3. Balance verification before entering transaction:
  // Mul taka (amount) er sathe charge (fee) plus kore check kora hobe balance e enough money ache kina
  const approverWallet = await transactionService.getOrCreateWallet(userId);
  if (Number(approverWallet.balance) < totalRequiredBalance) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Insufficient balance. You need BDT ${totalRequiredBalance} (Amount: ${amount} + Fee: ${fee}) to approve this request.`
    );
  }

  // 4. Perform atomic transfer: SEND_MONEY with fee
  const result = await prisma.$transaction(async (tx) => {
    // 4.1 First update status to APPROVED
    await tx.request.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        processedById: userId,
        processedAt: new Date(),
        adminNote: adminNote ?? null,
      },
    });

    // 4.2 Execute Send Money transfer via reused transactionService
    const transferResult = await transactionService.executeSendMoneyTransfer(
      {
        senderId: userId,
        receiverId: request.requesterId,
        amount,
        fee,
        description: adminNote || 'Approved money request',
        checkBalance: true,
      },
      tx
    );

    // 4.3 Link transactionId
    const updatedRequest = await tx.request.update({
      where: { id: requestId },
      data: {
        transactionId: transferResult.transaction.id,
      },
      include: {
        requester: {
          select: {
            id: true,
            role: true,
            phone: true,
            profile: { select: { name: true } },
          },
        },
        receiver: {
          select: {
            id: true,
            role: true,
            phone: true,
            profile: { select: { name: true } },
          },
        },
        processedBy: {
          select: {
            id: true,
            role: true,
            phone: true,
            profile: { select: { name: true } },
          },
        },
        transaction: true,
      },
    });

    return {
      request: updatedRequest,
      transaction: transferResult.transaction,
      senderBalance: transferResult.senderBalance,
      receiverBalance: transferResult.receiverBalance,
    };
  });

  // 5. Invalidate caches
  await invalidateAuthUserCache(userId);
  await invalidateAuthUserCache(request.requesterId);

  // 6. Real-time Socket.IO notifications
  const io = getIO();
  io.to(request.requesterId).emit('money-request-approved', result.request);
  io.to(request.requesterId).emit('balance-updated', { balance: result.receiverBalance });
  io.to(request.requesterId).emit('notification', {
    message: `Your money request for BDT ${amount} has been approved.`,
  });
  io.to(userId).emit('balance-updated', { balance: result.senderBalance });

  return result;
};

// Unified approve request: automatically delegates to approveBusinessRequest or approvePersonalRequest
const approveRequest = async (
  user: TJwtPayload,
  requestId: string,
  payload: TProcessRequestInput
) => {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, receiverId: true },
  });

  if (!request) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Money request not found.');
  }

  if (request.receiverId) {
    return approvePersonalRequest(user, requestId, payload);
  } else {
    return approveBusinessRequest(user, requestId, payload);
  }
};

export const requestService = {
  createBusinessRequest,
  createPersonalRequest,
  getRequests,
  getAgentRequests,
  getMyRequests,
  getReceivedRequests,
  getProcessedRequests,
  getRequestById,
  cancelRequest,
  deleteRequest,
  rejectRequest,
  approveRequest,
  approveBusinessRequest,
  approvePersonalRequest,
};

