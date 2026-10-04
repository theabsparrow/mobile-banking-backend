-- CreateTable
CREATE TABLE "transaction_fee_configs" (
    "id" TEXT NOT NULL,
    "sendMoneyFeePerThousand" DECIMAL(10,2) NOT NULL DEFAULT 5.00,
    "cashOutFeePerThousand" DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    "cashInCommissionPerThousand" DECIMAL(10,2) NOT NULL DEFAULT 4.14,
    "cashOutCommissionPerThousand" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_fee_configs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "transaction_fee_configs" ADD CONSTRAINT "transaction_fee_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
