-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "defaultPasswordExpiry" TIMESTAMP(3),
ADD COLUMN     "image" TEXT,
ADD COLUMN     "isDefaultPassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name" TEXT;

-- CreateTable
CREATE TABLE "UserContact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "savedUserId" TEXT NOT NULL,
    "customName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserContact_ownerId_idx" ON "UserContact"("ownerId");

-- CreateIndex
CREATE INDEX "UserContact_savedUserId_idx" ON "UserContact"("savedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserContact_ownerId_savedUserId_key" ON "UserContact"("ownerId", "savedUserId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContact" ADD CONSTRAINT "UserContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContact" ADD CONSTRAINT "UserContact_savedUserId_fkey" FOREIGN KEY ("savedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
