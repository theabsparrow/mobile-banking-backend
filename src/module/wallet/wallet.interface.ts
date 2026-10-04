export interface IWalletUser {
  id: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  profile: {
    name: string | null;
    image: string | null;
    address: string | null;
  } | null;
}

export interface IWalletResponse {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: IWalletUser;
}
