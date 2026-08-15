export type TCreateBusinessRequestInput = {
  amount: number;
  reason: string;
  pin: string;
};

export type TCreatePersonalRequestInput = {
  receiverId: string;
  amount: number;
  reason: string;
  pin: string;
};

export type TCancelRequestInput = {
  pin: string;
};

export type TDeleteRequestInput = {
  pin: string;
};

export type TRejectRequestInput = {
  pin: string;
  rejectionReason?: string;
};

export type TProcessRequestInput = {
  pin: string;
  adminNote?: string;
};
