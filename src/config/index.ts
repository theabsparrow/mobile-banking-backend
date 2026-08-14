import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export default {
  node_env: process.env.NODE_ENV,
  prisma_database_url: process.env.PRISMA_DATABASE_URL,
  mongodb_database_url: process.env.MONGODB_DATABASE_URL,
  client_url: process.env.CLIENT_URL,
  port: process.env.PORT || 5000,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  // redis
  redis_url: process.env.REDIS_URL || 'redis://localhost:6379',
  rate_limiting_window: process.env.RATE_LIMITING_WINDOW,
  rate_limiting_max_requests: process.env.RATE_LIMITING_MAX_REQUESTS,
  // nodemailer
  smtp_host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  smtp_port: parseInt(process.env.SMTP_PORT || '2525', 10),
  smtp_user: process.env.SMTP_USER || '',
  smtp_pass: process.env.SMTP_PASS || '',
  smtp_from: process.env.SMTP_FROM || 'no-reply@mobile-banking.com',

  // jwt section
  jwt_access_secret: process.env.JWT_ACCESS_SECRET,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN,

  // default password
  default_password: process.env.DEFAULT_USER_PASSWORD,
  default_password_validity_hours: process.env.DEFAULT_PASSWORD_VALIDITY_HOURS,
};
