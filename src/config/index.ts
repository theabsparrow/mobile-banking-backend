import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export default {
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
};
