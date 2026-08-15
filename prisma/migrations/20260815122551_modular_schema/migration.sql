/*
  Warnings:

  - The values [ADMIN_TO_AGENT,AGENT_TO_ADMIN,AGENT_TO_AGENT,USER_TO_USER,USER_TO_AGENT,AGENT_TO_USER] on the enum `TransactionType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TransactionType_new" AS ENUM ('SEND_MONEY', 'CASH_IN', 'CASH_OUT', 'REFUND');
ALTER TABLE "transactions" ALTER COLUMN "type" TYPE "TransactionType_new" USING ("type"::text::"TransactionType_new");
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";
ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";
DROP TYPE "public"."TransactionType_old";
COMMIT;
