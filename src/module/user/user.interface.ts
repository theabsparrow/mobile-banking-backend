export type TQuery = {
  page?: string | number;
  limit?: string | number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: unknown;
};


export type TCreateUser = {
  email: string;
  phone?: string;
  name?: string;
  password?: string;
};

export type TUser = {
  name: string;
  email: string;
  phone: string;
  address: string
  image: string
};

export type TSearchUserQuery = {
  name?: string;
  email?: string;
  phone?: string;
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};
