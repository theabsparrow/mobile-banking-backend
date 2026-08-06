import jwt, { type SignOptions } from 'jsonwebtoken';
export type TJwtPayload = {
  userId: string;
  userRole: string;
};

const createToken = (payload: TJwtPayload, secret: string, expiresIn: string) => {
  return jwt.sign(payload, secret, {
    expiresIn,
  } as SignOptions);
};

export default createToken;
