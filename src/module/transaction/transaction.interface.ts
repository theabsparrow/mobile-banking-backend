import type { TransactionType, TransactionStatus } from '@prisma/client';

export type TSendMoneyInput = {
  receiverPhoneOrEmail: string;
  amount: number;
  pin: string;
};

export type TCashInInput = {
  receiverPhoneOrEmail: string;
  amount: number;
  pin?: string;
  description?: string;
};

export type TAdminCashInInput = {
  agentPhoneOrEmail: string;
  amount: number;
  pin?: string;
  description?: string;
};

export type TCashOutInput = {
  agentPhoneOrEmail: string;
  amount: number;
  pin: string;
};

export interface IExecuteTransferPayload {
  senderId: string;
  receiverId: string;
  amount: number;
  fee?: number;
  type?: TransactionType;
  description?: string;
  checkBalance?: boolean;
}

export interface ITransactionQuery {
  page?: string | number;
  limit?: string | number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  senderSearch?: string;
  receiverSearch?: string;
  service?: string;
  type?: string;
  status?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
}

export type TUpdateFeeConfigInput = {
  sendMoneyFeePerThousand?: number;
  cashOutFeePerThousand?: number;
  cashInCommissionPerThousand?: number;
  cashOutCommissionPerThousand?: number;
};
