/* eslint-disable @typescript-eslint/no-explicit-any */
import { Role, type TransactionStatus, type TransactionType } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { verifyUserPin } from '../../utills/verifyPin.js';
import type {
  IExecuteTransferPayload,
  ITransactionQuery,
  TAdminCashInInput,
  TCashInInput,
  TCashOutInput,
  TSendMoneyInput,
  TUpdateFeeConfigInput,
} from './transaction.interface.js';
import {
  buildDateFilter,
  calculateCashInCommission,
  calculateCashOutFee,
  calculateSendMoneyFee,
  getOrCreateWallet,
  getTransactionFeeConfig,
  getUserWallet,
  invalidateCaches,
  invalidateFeeConfigCache,
  safeEmit,
} from './transaction.utills.js';

// ---------------------------------------------------------------------------
// Core Money Transfer Function (Compatible with request.service.ts)
// ---------------------------------------------------------------------------
const executeMoneyTransfer = async (
  payload: IExecuteTransferPayload,
  externalTx?: any
) => {
  const {
    senderId,
    receiverId,
    amount,
    type = 'SEND_MONEY',
    description,
    checkBalance = true,
  } = payload;

  const feeConfig = await getTransactionFeeConfig();
  const fee =
    payload.fee !== undefined
      ? payload.fee
      : type === 'SEND_MONEY'
      ? calculateSendMoneyFee(amount, feeConfig.sendMoneyFeePerThousand)
      : 0;

  const totalDeductAmount = Number((amount + fee).toFixed(2));

  const runTransfer = async (tx: any) => {
    const senderWallet = await getUserWallet(senderId, tx);
    const receiverWallet = await getUserWallet(receiverId, tx);

    if (checkBalance && Number(senderWallet.balance) < totalDeductAmount) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Insufficient balance. You need BDT ${totalDeductAmount} (Amount: ${amount} + Fee: ${fee}) to complete this transfer.`
      );
    }

    // Deduct sender wallet & user balance
    const updatedSenderWallet = await tx.wallet.update({
      where: { id: senderWallet.id },
      data: { balance: { decrement: totalDeductAmount } },
    });

    await tx.user.update({
      where: { id: senderId },
      data: { balance: { decrement: totalDeductAmount } },
    });

    // Credit receiver wallet & user balance
    const updatedReceiverWallet = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.user.update({
      where: { id: receiverId },
      data: { balance: { increment: amount } },
    });

    const prefix =
      type === 'CASH_IN' ? 'TXN-CI' : type === 'CASH_OUT' ? 'TXN-CO' : 'TXN-SM';
    const reference = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const transaction = await tx.transaction.create({
      data: {
        reference,
        type,
        status: 'COMPLETED',
        amount,
        fee,
        totalAmount: totalDeductAmount,
        senderWalletId: senderWallet.id,
        receiverWalletId: receiverWallet.id,
        initiatedById: senderId,
        description: description || `Transfer of BDT ${amount}`,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: senderWallet.id,
        transactionId: transaction.id,
        type: 'DEBIT',
        amount: totalDeductAmount,
        balanceBefore: senderWallet.balance,
        balanceAfter: Number(senderWallet.balance) - totalDeductAmount,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: receiverWallet.id,
        transactionId: transaction.id,
        type: 'CREDIT',
        amount,
        balanceBefore: receiverWallet.balance,
        balanceAfter: Number(receiverWallet.balance) + amount,
      },
    });

    return {
      transaction,
      fee,
      totalAmount: totalDeductAmount,
      senderBalance: Number(updatedSenderWallet.balance),
      receiverBalance: Number(updatedReceiverWallet.balance),
    };
  };

  let result;
  if (externalTx) {
    result = await runTransfer(externalTx);
  } else {
    result = await prisma.$transaction(async (tx) => {
      return await runTransfer(tx);
    });
  }

  if (!externalTx) {
    await invalidateCaches(senderId, receiverId);

    safeEmit((io) => {
      io.to(receiverId).emit('balance-updated', { balance: result.receiverBalance });
      io.to(senderId).emit('balance-updated', { balance: result.senderBalance });
      io.to(receiverId).emit('new-transaction', result.transaction);
      io.to(senderId).emit('new-transaction', result.transaction);
    });
  }

  return result;
};

// Helper specifically for Send Money transfer
const executeSendMoneyTransfer = async (
  payload: Omit<IExecuteTransferPayload, 'type'>,
  externalTx?: any
) => {
  const feeConfig = await getTransactionFeeConfig();
  return executeMoneyTransfer(
    {
      ...payload,
      type: 'SEND_MONEY',
      fee:
        payload.fee !== undefined
          ? payload.fee
          : calculateSendMoneyFee(payload.amount, feeConfig.sendMoneyFeePerThousand),
    },
    externalTx
  );
};

// Helper specifically for Cash In transfer
const executeCashInTransfer = async (
  payload: Omit<IExecuteTransferPayload, 'type'>,
  externalTx?: any
) => {
  return executeMoneyTransfer(
    {
      ...payload,
      type: 'CASH_IN',
      fee: 0,
    },
    externalTx
  );
};

// ---------------------------------------------------------------------------
// 1. Admin to Agent Cash In (Float Allocation)
// ---------------------------------------------------------------------------
const adminCashIn = async (adminId: string, payload: TAdminCashInInput) => {
  const { agentPhoneOrEmail, amount, pin, description } = payload;

  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { id: true, role: true, isPinSet: true },
  });

  if (!admin || (admin.role !== Role.ADMIN && admin.role !== Role.SUPER_ADMIN)) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only admins can perform float cash in.');
  }

  // If admin has a PIN set, verify using verifyUserPin helper
  if (admin.isPinSet && pin) {
    const isPinValid = await verifyUserPin(adminId, pin);
    if (!isPinValid) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid PIN.');
    }
  }

  // Find target Agent
  const agent = await prisma.user.findFirst({
    where: {
      OR: [{ email: agentPhoneOrEmail }, { phone: agentPhoneOrEmail }],
      role: Role.AGENT,
      status: 'ACTIVE',
    },
    include: { profile: true },
  });

  if (!agent) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Active agent not found with provided phone/email.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const adminWallet = await getUserWallet(adminId, tx);
    const agentWallet = await getUserWallet(agent.id, tx);

    // Update Admin wallet & balance (checkBalance: false for float issuance)
    const updatedAdminWallet = await tx.wallet.update({
      where: { id: adminWallet.id },
      data: { balance: { decrement: amount } },
    });
    await tx.user.update({
      where: { id: adminId },
      data: { balance: { decrement: amount } },
    });

    // Update Agent wallet & balance
    const updatedAgentWallet = await tx.wallet.update({
      where: { id: agentWallet.id },
      data: { balance: { increment: amount } },
    });
    await tx.user.update({
      where: { id: agent.id },
      data: { balance: { increment: amount } },
    });

    const reference = `TXN-CI-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const transaction = await tx.transaction.create({
      data: {
        reference,
        type: 'CASH_IN',
        status: 'COMPLETED',
        amount,
        fee: 0,
        totalAmount: amount,
        senderWalletId: adminWallet.id,
        receiverWalletId: agentWallet.id,
        initiatedById: adminId,
        description: description || `Admin cash in / float to agent ${agent.profile?.name || agent.phone}`,
      },
      include: {
        senderWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
        receiverWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
      },
    });

    // Ledgers
    await tx.walletLedger.create({
      data: {
        walletId: adminWallet.id,
        transactionId: transaction.id,
        type: 'DEBIT',
        amount,
        balanceBefore: adminWallet.balance,
        balanceAfter: Number(adminWallet.balance) - amount,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: agentWallet.id,
        transactionId: transaction.id,
        type: 'CREDIT',
        amount,
        balanceBefore: agentWallet.balance,
        balanceAfter: Number(agentWallet.balance) + amount,
      },
    });

    return {
      transaction,
      adminBalance: Number(updatedAdminWallet.balance),
      agentBalance: Number(updatedAgentWallet.balance),
    };
  });

  await invalidateCaches(adminId, agent.id);

  // Real-time notifications
  safeEmit((io) => {
    io.to(agent.id).emit('balance-updated', { balance: result.agentBalance });
    io.to(agent.id).emit('notification', {
      message: `Your wallet received BDT ${amount} float from Admin.`,
    });
    io.to(agent.id).emit('new-transaction', result.transaction);
    io.to(adminId).emit('balance-updated', { balance: result.adminBalance });
    io.to(adminId).emit('new-transaction', result.transaction);
  });

  return result;
};

// ---------------------------------------------------------------------------
// 2. Agent to User Cash In (With Dynamic Agent Commission from DB)
// ---------------------------------------------------------------------------
const cashInToUser = async (agentId: string, payload: TCashInInput) => {
  const { receiverPhoneOrEmail, amount, pin, description } = payload;

  if (!pin) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'PIN is required for cash in.');
  }

  // 1. Verify PIN via shared helper
  const isPinValid = await verifyUserPin(agentId, pin);
  if (!isPinValid) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid PIN.');
  }

  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, role: true, phone: true, profile: { select: { name: true } } },
  });

  if (!agent || agent.role !== Role.AGENT) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only agents can perform business cash in to users.');
  }

  // 2. Find Receiver (Customer)
  const receiver = await prisma.user.findFirst({
    where: {
      OR: [{ email: receiverPhoneOrEmail }, { phone: receiverPhoneOrEmail }],
      role: Role.CUSTOMER,
      status: 'ACTIVE',
    },
    include: { profile: true },
  });

  if (!receiver) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Receiver customer not found or is inactive.');
  }

  if (agentId === receiver.id) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Cannot cash in to your own account.');
  }

  // Dynamic Commission calculation for Agent from DB
  const feeConfig = await getTransactionFeeConfig();
  const commissionRate = feeConfig.cashInCommissionPerThousand;
  const commissionAmount = calculateCashInCommission(amount, commissionRate);

  const result = await prisma.$transaction(async (tx) => {
    const agentWallet = await getUserWallet(agentId, tx);
    const receiverWallet = await getUserWallet(receiver.id, tx);

    if (Number(agentWallet.balance) < amount) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Insufficient wallet balance. You need BDT ${amount} to complete this cash in.`
      );
    }

    // 1. Deduct amount from agent and credit commission to agent
    const netAgentDeduction = Number((amount - commissionAmount).toFixed(2));
    const updatedAgentWallet = await tx.wallet.update({
      where: { id: agentWallet.id },
      data: { balance: { decrement: netAgentDeduction } },
    });

    await tx.user.update({
      where: { id: agentId },
      data: { balance: { decrement: netAgentDeduction } },
    });

    // 2. Credit receiver wallet & user balance by full amount
    const updatedReceiverWallet = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.user.update({
      where: { id: receiver.id },
      data: { balance: { increment: amount } },
    });

    const reference = `TXN-CI-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // 3. Create Transaction
    const transaction = await tx.transaction.create({
      data: {
        reference,
        type: 'CASH_IN',
        status: 'COMPLETED',
        amount,
        fee: 0,
        totalAmount: amount,
        senderWalletId: agentWallet.id,
        receiverWalletId: receiverWallet.id,
        initiatedById: agentId,
        description: description || `Cash in to ${receiver.profile?.name || receiver.email}`,
      },
      include: {
        senderWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
        receiverWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
      },
    });

    // 4. Create Commission record in separate commission table
    const commissionRecord = await tx.commission.create({
      data: {
        agentId,
        transactionId: transaction.id,
        amount: commissionAmount,
        rate: commissionRate,
        description: `Commission for cash in of BDT ${amount} to ${receiver.profile?.name || receiver.phone || receiver.email}`,
      },
    });

    // 5. Ledgers
    await tx.walletLedger.create({
      data: {
        walletId: agentWallet.id,
        transactionId: transaction.id,
        type: 'DEBIT',
        amount,
        balanceBefore: agentWallet.balance,
        balanceAfter: Number(agentWallet.balance) - amount,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: receiverWallet.id,
        transactionId: transaction.id,
        type: 'CREDIT',
        amount,
        balanceBefore: receiverWallet.balance,
        balanceAfter: Number(receiverWallet.balance) + amount,
      },
    });

    if (commissionAmount > 0) {
      await tx.walletLedger.create({
        data: {
          walletId: agentWallet.id,
          transactionId: transaction.id,
          type: 'CREDIT',
          amount: commissionAmount,
          balanceBefore: Number(agentWallet.balance) - amount,
          balanceAfter: Number(updatedAgentWallet.balance),
        },
      });
    }

    return {
      transaction,
      commission: commissionRecord,
      agentBalance: Number(updatedAgentWallet.balance),
      receiverBalance: Number(updatedReceiverWallet.balance),
    };
  });

  await invalidateCaches(agentId, receiver.id);

  // Notify receiver and agent in real time
  safeEmit((io) => {
    io.to(receiver.id).emit('balance-updated', { balance: result.receiverBalance });
    io.to(receiver.id).emit('notification', {
      message: `Your account has been cashed in BDT ${amount} by agent ${agent.profile?.name || agent.phone}.`,
    });
    io.to(receiver.id).emit('new-transaction', result.transaction);

    io.to(agentId).emit('balance-updated', { balance: result.agentBalance });
    io.to(agentId).emit('notification', {
      message: `Cash in of BDT ${amount} completed. You earned BDT ${commissionAmount} commission!`,
    });
    io.to(agentId).emit('new-transaction', result.transaction);
  });

  return result;
};

// ---------------------------------------------------------------------------
// 3. User to User Send Money (Dynamic Per-thousand Fee from DB)
// ---------------------------------------------------------------------------
const sendMoney = async (senderId: string, payload: TSendMoneyInput) => {
  const { receiverPhoneOrEmail, amount, pin } = payload;

  // 1. Verify PIN via shared helper
  const isPinValid = await verifyUserPin(senderId, pin);
  if (!isPinValid) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid PIN.');
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { id: true, role: true, email: true, phone: true, profile: { select: { name: true } } },
  });

  if (!sender || sender.role !== Role.CUSTOMER) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only customers can send money.');
  }

  // 2. Find Receiver (Customer)
  const receiver = await prisma.user.findFirst({
    where: {
      OR: [{ email: receiverPhoneOrEmail }, { phone: receiverPhoneOrEmail }],
      role: Role.CUSTOMER,
      status: 'ACTIVE',
    },
    include: { profile: true },
  });

  if (!receiver) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Receiver customer not found or is inactive.');
  }

  if (senderId === receiver.id) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'You cannot send money to yourself.');
  }

  const feeConfig = await getTransactionFeeConfig();
  const fee = calculateSendMoneyFee(amount, feeConfig.sendMoneyFeePerThousand);

  const result = await executeMoneyTransfer({
    senderId,
    receiverId: receiver.id,
    amount,
    fee,
    type: 'SEND_MONEY',
    description: `Send money to ${receiver.profile?.name || receiver.email}`,
    checkBalance: true,
  });

  safeEmit((io) => {
    io.to(receiver.id).emit('notification', {
      message: `You received BDT ${amount} from ${sender.profile?.name || sender.phone || sender.email}.`,
    });
  });

  return result;
};

// ---------------------------------------------------------------------------
// 4. Customer Cash Out to Agent (Dynamic Per-thousand Fee from DB)
// ---------------------------------------------------------------------------
const cashOut = async (userId: string, payload: TCashOutInput) => {
  const { agentPhoneOrEmail, amount, pin } = payload;

  // 1. Verify PIN via shared helper
  const isPinValid = await verifyUserPin(userId, pin);
  if (!isPinValid) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid PIN.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, phone: true, profile: { select: { name: true } } },
  });

  if (!user || user.role !== Role.CUSTOMER) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only customers can perform cash out.');
  }

  // 2. Find Agent
  const agent = await prisma.user.findFirst({
    where: {
      OR: [{ email: agentPhoneOrEmail }, { phone: agentPhoneOrEmail }],
      role: Role.AGENT,
      status: 'ACTIVE',
    },
    include: { profile: true },
  });

  if (!agent) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Agent not found or is inactive.');
  }

  const feeConfig = await getTransactionFeeConfig();
  const fee = calculateCashOutFee(amount, feeConfig.cashOutFeePerThousand);
  const totalDeductAmount = Number((amount + fee).toFixed(2));

  const result = await prisma.$transaction(async (tx) => {
    const userWallet = await getUserWallet(userId, tx);
    const agentWallet = await getUserWallet(agent.id, tx);

    if (Number(userWallet.balance) < totalDeductAmount) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Insufficient balance. You need BDT ${totalDeductAmount} (Amount: ${amount} + Fee: ${fee}) to complete this cash out.`
      );
    }

    // Deduct user wallet & balance by totalDeductAmount
    const updatedUserWallet = await tx.wallet.update({
      where: { id: userWallet.id },
      data: { balance: { decrement: totalDeductAmount } },
    });

    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: totalDeductAmount } },
    });

    // Credit agent wallet & balance by amount
    const updatedAgentWallet = await tx.wallet.update({
      where: { id: agentWallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.user.update({
      where: { id: agent.id },
      data: { balance: { increment: amount } },
    });

    const reference = `TXN-CO-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const transaction = await tx.transaction.create({
      data: {
        reference,
        type: 'CASH_OUT',
        status: 'COMPLETED',
        amount,
        fee,
        totalAmount: totalDeductAmount,
        senderWalletId: userWallet.id,
        receiverWalletId: agentWallet.id,
        initiatedById: userId,
        description: `Cash out to agent ${agent.profile?.name || agent.email}`,
      },
      include: {
        senderWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
        receiverWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: userWallet.id,
        transactionId: transaction.id,
        type: 'DEBIT',
        amount: totalDeductAmount,
        balanceBefore: userWallet.balance,
        balanceAfter: Number(userWallet.balance) - totalDeductAmount,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: agentWallet.id,
        transactionId: transaction.id,
        type: 'CREDIT',
        amount,
        balanceBefore: agentWallet.balance,
        balanceAfter: Number(agentWallet.balance) + amount,
      },
    });

    return {
      transaction,
      fee,
      totalAmount: totalDeductAmount,
      userBalance: Number(updatedUserWallet.balance),
      agentBalance: Number(updatedAgentWallet.balance),
    };
  });

  await invalidateCaches(userId, agent.id);

  // Notify agent and update balances in real time
  safeEmit((io) => {
    io.to(agent.id).emit('balance-updated', { balance: result.agentBalance });
    io.to(agent.id).emit('notification', {
      message: `Received cash out of BDT ${amount} from customer ${user.profile?.name || user.phone}.`,
    });
    io.to(agent.id).emit('new-transaction', result.transaction);

    io.to(userId).emit('balance-updated', { balance: result.userBalance });
    io.to(userId).emit('new-transaction', result.transaction);
  });

  return result;
};

// ---------------------------------------------------------------------------
// 5. Admin & Super Admin: View All Transactions
// ---------------------------------------------------------------------------
const getAllTransactions = async (query: ITransactionQuery) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  const where: any = {};

  // 1. Service / Transaction Type filter
  const service = (query.service || query.type) as string;
  if (service) {
    if (service.includes(',')) {
      const types = service.split(',').map((s) => s.trim().toUpperCase() as TransactionType);
      where.type = { in: types };
    } else {
      where.type = service.trim().toUpperCase() as TransactionType;
    }
  }

  // 2. Status filter
  if (query.status && typeof query.status === 'string') {
    if (query.status.includes(',')) {
      const statuses = query.status.split(',').map((s) => s.trim().toUpperCase() as TransactionStatus);
      where.status = { in: statuses };
    } else {
      where.status = query.status.trim().toUpperCase() as TransactionStatus;
    }
  }

  // 3. Date filtering (exact date or range)
  const dateFilter = buildDateFilter(query);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  // 4. Sender search (name, email, phone)
  const senderSearch = (query.senderSearch || query.senderName || query.senderEmail || query.senderPhone) as string;
  if (senderSearch) {
    const term = senderSearch.trim();
    where.senderWallet = {
      user: {
        OR: [
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
          { profile: { name: { contains: term, mode: 'insensitive' } } },
        ],
      },
    };
  }

  // 5. Receiver search (name, email, phone)
  const receiverSearch = (query.receiverSearch || query.receiverName || query.receiverEmail || query.receiverPhone) as string;
  if (receiverSearch) {
    const term = receiverSearch.trim();
    where.receiverWallet = {
      user: {
        OR: [
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
          { profile: { name: { contains: term, mode: 'insensitive' } } },
        ],
      },
    };
  }

  // 6. Global search across sender, receiver, reference, description
  if (query.search && typeof query.search === 'string') {
    const searchTerm = query.search.trim();
    const globalSearchConditions = [
      { reference: { contains: searchTerm, mode: 'insensitive' } },
      { description: { contains: searchTerm, mode: 'insensitive' } },
      {
        senderWallet: {
          user: {
            OR: [
              { email: { contains: searchTerm, mode: 'insensitive' } },
              { phone: { contains: searchTerm, mode: 'insensitive' } },
              { profile: { name: { contains: searchTerm, mode: 'insensitive' } } },
            ],
          },
        },
      },
      {
        receiverWallet: {
          user: {
            OR: [
              { email: { contains: searchTerm, mode: 'insensitive' } },
              { phone: { contains: searchTerm, mode: 'insensitive' } },
              { profile: { name: { contains: searchTerm, mode: 'insensitive' } } },
            ],
          },
        },
      },
    ];

    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: globalSearchConditions }];
      delete where.OR;
    } else {
      where.OR = globalSearchConditions;
    }
  }

  const [transactions, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        senderWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
        receiverWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
        initiatedBy: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            profile: { select: { name: true, image: true } },
          },
        },
        commission: true,
        ledgerEntries: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data: transactions,
  };
};

// ---------------------------------------------------------------------------
// 6. Customer & Agent: View Own Transactions (With Counterparty Search & Soft Hide)
// ---------------------------------------------------------------------------
const getMyTransactions = async (userId: string, query: ITransactionQuery) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  const andConditions: any[] = [];

  // A. User must be participant (sender or receiver)
  andConditions.push({
    OR: [
      { senderWallet: { userId } },
      { receiverWallet: { userId } },
      { initiatedById: userId },
    ],
  });

  // B. Exclude transactions that this user has deleted / hidden
  andConditions.push({
    hiddenBy: {
      none: {
        userId,
      },
    },
  });

  // C. Service / Type filter
  const service = (query.service || query.type) as string;
  if (service) {
    if (service.includes(',')) {
      const types = service.split(',').map((s) => s.trim().toUpperCase() as TransactionType);
      andConditions.push({ type: { in: types } });
    } else {
      andConditions.push({ type: service.trim().toUpperCase() as TransactionType });
    }
  }

  // D. Status filter
  if (query.status && typeof query.status === 'string') {
    if (query.status.includes(',')) {
      const statuses = query.status.split(',').map((s) => s.trim().toUpperCase() as TransactionStatus);
      andConditions.push({ status: { in: statuses } });
    } else {
      andConditions.push({ status: query.status.trim().toUpperCase() as TransactionStatus });
    }
  }

  // E. Date filter
  const dateFilter = buildDateFilter(query);
  if (dateFilter) {
    andConditions.push({ createdAt: dateFilter });
  }

  // F. Counterparty search (name, email, phone) or transaction reference
  if (query.search && typeof query.search === 'string') {
    const searchTerm = query.search.trim();
    andConditions.push({
      OR: [
        { reference: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        {
          senderWallet: {
            user: {
              OR: [
                { email: { contains: searchTerm, mode: 'insensitive' } },
                { phone: { contains: searchTerm, mode: 'insensitive' } },
                { profile: { name: { contains: searchTerm, mode: 'insensitive' } } },
              ],
            },
          },
        },
        {
          receiverWallet: {
            user: {
              OR: [
                { email: { contains: searchTerm, mode: 'insensitive' } },
                { phone: { contains: searchTerm, mode: 'insensitive' } },
                { profile: { name: { contains: searchTerm, mode: 'insensitive' } } },
              ],
            },
          },
        },
      ],
    });
  }

  const where = { AND: andConditions };

  const [transactions, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        senderWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
        receiverWallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                profile: { select: { name: true, image: true } },
              },
            },
          },
        },
        initiatedBy: {
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
            profile: { select: { name: true, image: true } },
          },
        },
        commission: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  // Format response for the logged in user with direction & counterparty
  const formattedData = transactions.map((tx) => {
    const isSender = tx.senderWallet?.userId === userId;
    const counterparty = isSender ? tx.receiverWallet?.user : tx.senderWallet?.user;

    return {
      ...tx,
      direction: isSender ? 'OUT' : 'IN',
      counterparty: counterparty || null,
    };
  });

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data: formattedData,
  };
};

// ---------------------------------------------------------------------------
// 7. Soft Delete / Hide Transaction (Per-User)
// ---------------------------------------------------------------------------
const hideTransaction = async (userId: string, transactionId: string) => {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      senderWallet: true,
      receiverWallet: true,
    },
  });

  if (!transaction) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Transaction not found.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  const isSender = transaction.senderWallet?.userId === userId;
  const isReceiver = transaction.receiverWallet?.userId === userId;
  const isInitiator = transaction.initiatedById === userId;
  const isAdmin = user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;

  if (!isSender && !isReceiver && !isInitiator && !isAdmin) {
    throw new AppError(StatusCodes.FORBIDDEN, 'You are not authorized to remove this transaction.');
  }

  // Upsert record into TransactionHide table
  await prisma.transactionHide.upsert({
    where: {
      transactionId_userId: {
        transactionId,
        userId,
      },
    },
    create: {
      transactionId,
      userId,
    },
    update: {},
  });

  safeEmit((io) => {
    io.to(userId).emit('transaction-hidden', { transactionId });
  });

  return {
    transactionId,
    message: 'Transaction removed from your view successfully.',
  };
};

// ---------------------------------------------------------------------------
// 8. Agent Commissions & Total Income
// ---------------------------------------------------------------------------
const getAgentCommissions = async (agentId: string, query: ITransactionQuery) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  const where: any = { agentId };

  const dateFilter = buildDateFilter(query);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  if (query.search && typeof query.search === 'string') {
    const term = query.search.trim();
    where.OR = [
      { description: { contains: term, mode: 'insensitive' } },
      { transaction: { reference: { contains: term, mode: 'insensitive' } } },
    ];
  }

  // Aggregation for Total Income
  const aggregateResult = await prisma.commission.aggregate({
    where: { agentId },
    _sum: { amount: true },
    _count: { id: true },
  });

  const totalIncome = Number(aggregateResult._sum.amount || 0);

  const [commissions, total] = await prisma.$transaction([
    prisma.commission.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        transaction: {
          select: {
            id: true,
            reference: true,
            type: true,
            status: true,
            amount: true,
            createdAt: true,
            receiverWallet: {
              select: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    phone: true,
                    profile: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.commission.count({ where }),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    data: {
      totalIncome,
      commissions,
    },
  };
};

// ---------------------------------------------------------------------------
// 9. Dynamic Fee & Commission Config Management (Admin Dashboard)
// ---------------------------------------------------------------------------
const getFeeConfig = async () => {
  return await getTransactionFeeConfig();
};

const updateFeeConfig = async (userId: string, payload: TUpdateFeeConfigInput) => {
  let config = await prisma.transactionFeeConfig.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!config) {
    config = await prisma.transactionFeeConfig.create({
      data: {
        sendMoneyFeePerThousand: payload.sendMoneyFeePerThousand ?? 5.0,
        cashOutFeePerThousand: payload.cashOutFeePerThousand ?? 15.0,
        cashInCommissionPerThousand: payload.cashInCommissionPerThousand ?? 4.14,
        cashOutCommissionPerThousand: payload.cashOutCommissionPerThousand ?? 0.0,
        updatedById: userId,
      },
    });
  } else {
    config = await prisma.transactionFeeConfig.update({
      where: { id: config.id },
      data: {
        ...(payload.sendMoneyFeePerThousand !== undefined
          ? { sendMoneyFeePerThousand: payload.sendMoneyFeePerThousand }
          : {}),
        ...(payload.cashOutFeePerThousand !== undefined
          ? { cashOutFeePerThousand: payload.cashOutFeePerThousand }
          : {}),
        ...(payload.cashInCommissionPerThousand !== undefined
          ? { cashInCommissionPerThousand: payload.cashInCommissionPerThousand }
          : {}),
        ...(payload.cashOutCommissionPerThousand !== undefined
          ? { cashOutCommissionPerThousand: payload.cashOutCommissionPerThousand }
          : {}),
        updatedById: userId,
      },
    });
  }

  await invalidateFeeConfigCache();

  return {
    id: config.id,
    sendMoneyFeePerThousand: Number(config.sendMoneyFeePerThousand),
    cashOutFeePerThousand: Number(config.cashOutFeePerThousand),
    cashInCommissionPerThousand: Number(config.cashInCommissionPerThousand),
    cashOutCommissionPerThousand: Number(config.cashOutCommissionPerThousand),
    updatedById: config.updatedById,
    updatedAt: config.updatedAt,
  };
};

export const transactionService = {
  sendMoney,
  cashInToUser,
  adminCashIn,
  cashOut,
  getAllTransactions,
  getMyTransactions,
  hideTransaction,
  getAgentCommissions,
  getFeeConfig,
  updateFeeConfig,
  executeMoneyTransfer,
  executeSendMoneyTransfer,
  executeCashInTransfer,
  getUserWallet,
  getOrCreateWallet,
  SEND_MONEY_FEE: 5,
};
