-- AlterTable
ALTER TABLE "messages" ADD COLUMN "iv" TEXT;
ALTER TABLE "messages" ADD COLUMN "senderContent" TEXT;
ALTER TABLE "messages" ADD COLUMN "senderEncryptedKey" TEXT;
ALTER TABLE "messages" ADD COLUMN "senderIv" TEXT;
