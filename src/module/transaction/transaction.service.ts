import { Role, type TransactionType } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../config/prismaClient.js';
import AppError from '../../error/AppError.js';
import { getIO } from '../../socket/server.js';
import { compareData } from '../../utills/hashData.js';
import { invalidateAuthUserCache } from '../auth/auth.utills.js';
import type { TSendMoneyInput, TCashOutInput } from './transaction.interface.js';

interface IPrismaTx {
  wallet: typeof prisma.wallet;
}

// Helper to ensure a wallet exists for the user
export const getOrCreateWallet = async (userId: string, tx: IPrismaTx = prisma) => {
  let wallet = await tx.wallet.findUnique({
    where: { userId },
  });
  if (!wallet) {
    wallet = await tx.wallet.create({
      data: {
        userId,
        balance: 0.0,
      },
    });
  }
  return wallet;
};

// Helper to verify PIN
const verifyUserPin = async (userId: string, pin: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user || !user.pin) {
    throw new AppError(StatusCodes.FORBIDDEN, 'User PIN is not set.');
  }
  const isPinMatched = await compareData(pin, user.pin);
  if (!isPinMatched) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'Invalid PIN.');
  }
  return user;
};

export const SEND_MONEY_FEE = 5;
export const CASH_IN_FEE = 0;

export interface IExecuteTransferPayload {
  senderId: string;
  receiverId: string;
  amount: number;
  fee?: number;
  type?: TransactionType;
  description?: string;
  checkBalance?: boolean;
}

// Core reusable money transfer function
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

  const fee = payload.fee !== undefined ? payload.fee : (type === 'SEND_MONEY' ? SEND_MONEY_FEE : 0);
  const totalDeductAmount = amount + fee;

  const runTransfer = async (tx: any) => {
    const senderWallet = await getOrCreateWallet(senderId, tx);
    const receiverWallet = await getOrCreateWallet(receiverId, tx);

    if (checkBalance && Number(senderWallet.balance) < totalDeductAmount) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Insufficient balance. You need BDT ${totalDeductAmount} (Amount: ${amount} + Fee: ${fee}) to complete this transfer.`
      );
    }

    // Deduct sender wallet & user balance by totalDeductAmount (amount + fee)
    const updatedSenderWallet = await tx.wallet.update({
      where: { id: senderWallet.id },
      data: { balance: { decrement: totalDeductAmount } },
    });

    await tx.user.update({
      where: { id: senderId },
      data: { balance: { decrement: totalDeductAmount } },
    });

    // Credit receiver wallet & user balance by amount
    const updatedReceiverWallet = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.user.update({
      where: { id: receiverId },
      data: { balance: { increment: amount } },
    });

    const prefix = type === 'CASH_IN' ? 'TXN-CI' : type === 'CASH_OUT' ? 'TXN-CO' : 'TXN-SM';
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
    await invalidateAuthUserCache(senderId);
    await invalidateAuthUserCache(receiverId);

    const io = getIO();
    io.to(receiverId).emit('balance-updated', { balance: result.receiverBalance });
    io.to(senderId).emit('balance-updated', { balance: result.senderBalance });
  }

  return result;
};

// Helper specifically for Send Money transfer
const executeSendMoneyTransfer = async (
  payload: Omit<IExecuteTransferPayload, 'type'>,
  externalTx?: any
) => {
  return executeMoneyTransfer(
    {
      ...payload,
      type: 'SEND_MONEY',
      fee: payload.fee !== undefined ? payload.fee : SEND_MONEY_FEE,
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

const sendMoney = async (senderId: string, payload: TSendMoneyInput) => {
  const { receiverPhoneOrEmail, amount, pin } = payload;

  // 1. Verify PIN
  const sender = await verifyUserPin(senderId, pin);

  if (sender.role !== Role.CUSTOMER) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only customers can send money.');
  }

  // 2. Find Receiver (Customer)
  const receiver = await prisma.user.findFirst({
    where: {
      OR: [
        { email: receiverPhoneOrEmail },
        { phone: receiverPhoneOrEmail },
      ],
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

  const result = await executeMoneyTransfer({
    senderId,
    receiverId: receiver.id,
    amount,
    type: 'SEND_MONEY',
    description: `Send money to ${receiver.profile?.name || receiver.email}`,
    checkBalance: true,
  });

  const io = getIO();
  io.to(receiver.id).emit('notification', {
    message: `You received BDT ${amount} from ${sender.profile?.name || sender.phone || sender.email}.`,
  });

  return result;
};

const cashInToUser = async (agentId: string, payload: TSendMoneyInput) => {
  const { receiverPhoneOrEmail, amount, pin } = payload;

  // 1. Verify PIN
  const agent = await verifyUserPin(agentId, pin);

  if (agent.role !== Role.AGENT) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only agents can perform cash in.');
  }

  // 2. Find Receiver (Customer)
  const receiver = await prisma.user.findFirst({
    where: {
      OR: [
        { email: receiverPhoneOrEmail },
        { phone: receiverPhoneOrEmail },
      ],
      role: Role.CUSTOMER,
      status: 'ACTIVE',
    },
    include: { profile: true },
  });

  if (!receiver) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Receiver customer not found or is inactive.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const agentWallet = await getOrCreateWallet(agentId, tx);
    const receiverWallet = await getOrCreateWallet(receiver.id, tx);

    if (Number(agentWallet.balance) < amount) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient balance.');
    }

    // Deduct agent
    const updatedAgentWallet = await tx.wallet.update({
      where: { id: agentWallet.id },
      data: { balance: { decrement: amount } },
    });

    await tx.user.update({
      where: { id: agentId },
      data: { balance: { decrement: amount } },
    });

    // Credit receiver
    const updatedReceiverWallet = await tx.wallet.update({
      where: { id: receiverWallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.user.update({
      where: { id: receiver.id },
      data: { balance: { increment: amount } },
    });

    const reference = `TXN-CI-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const transaction = await tx.transaction.create({
      data: {
        reference,
        type: 'CASH_IN',
        status: 'COMPLETED',
        amount,
        totalAmount: amount,
        senderWalletId: agentWallet.id,
        receiverWalletId: receiverWallet.id,
        initiatedById: agentId,
        description: `Cash in to ${receiver.profile?.name || receiver.email}`,
      },
    });

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

    return {
      transaction,
      agentBalance: Number(updatedAgentWallet.balance),
      receiverBalance: Number(updatedReceiverWallet.balance),
    };
  });

  await invalidateAuthUserCache(agentId);
  await invalidateAuthUserCache(receiver.id);

  // Notify receiver and update balances
  const io = getIO();
  io.to(receiver.id).emit('balance-updated', { balance: result.receiverBalance });
  io.to(receiver.id).emit('notification', {
    message: `Your account has been cashed in BDT ${amount} by agent ${agent.profile?.name || agent.phone}.`,
  });

  return result;
};

const cashOut = async (userId: string, payload: TCashOutInput) => {
  const { agentPhoneOrEmail, amount, pin } = payload;

  // 1. Verify PIN
  const user = await verifyUserPin(userId, pin);

  if (user.role !== Role.CUSTOMER) {
    throw new AppError(StatusCodes.FORBIDDEN, 'Only customers can perform cash out.');
  }

  // 2. Find Agent
  const agent = await prisma.user.findFirst({
    where: {
      OR: [
        { email: agentPhoneOrEmail },
        { phone: agentPhoneOrEmail },
      ],
      role: Role.AGENT,
      status: 'ACTIVE',
    },
    include: { profile: true },
  });

  if (!agent) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Agent not found or is inactive.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const userWallet = await getOrCreateWallet(userId, tx);
    const agentWallet = await getOrCreateWallet(agent.id, tx);

    if (Number(userWallet.balance) < amount) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Insufficient balance.');
    }

    // Deduct user
    const updatedUserWallet = await tx.wallet.update({
      where: { id: userWallet.id },
      data: { balance: { decrement: amount } },
    });

    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: amount } },
    });

    // Credit agent
    const updatedAgentWallet = await tx.wallet.update({
      where: { id: agent.id },
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
        totalAmount: amount,
        senderWalletId: userWallet.id,
        receiverWalletId: agentWallet.id,
        initiatedById: userId,
        description: `Cash out to agent ${agent.profile?.name || agent.email}`,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: userWallet.id,
        transactionId: transaction.id,
        type: 'DEBIT',
        amount,
        balanceBefore: userWallet.balance,
        balanceAfter: Number(userWallet.balance) - amount,
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
      userBalance: Number(updatedUserWallet.balance),
      agentBalance: Number(updatedAgentWallet.balance),
    };
  });

  await invalidateAuthUserCache(userId);
  await invalidateAuthUserCache(agent.id);

  // Notify agent and update balances
  const io = getIO();
  io.to(agent.id).emit('balance-updated', { balance: result.agentBalance });
  io.to(agent.id).emit('notification', {
    message: `Received cash out of BDT ${amount} from customer ${user.profile?.name || user.phone}.`,
  });

  return result;
};

export const transactionService = {
  sendMoney,
  cashInToUser,
  cashOut,
  executeMoneyTransfer,
  executeSendMoneyTransfer,
  executeCashInTransfer,
  getOrCreateWallet,
  SEND_MONEY_FEE,
  CASH_IN_FEE,
};
