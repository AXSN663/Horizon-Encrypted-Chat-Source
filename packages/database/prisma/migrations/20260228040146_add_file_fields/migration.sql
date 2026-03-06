/*
  Warnings:

  - You are about to drop the column `senderContent` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the column `senderEncryptedKey` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the column `senderIv` on the `messages` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "iv" TEXT,
    "senderId" TEXT NOT NULL,
    "roomId" TEXT,
    "channelId" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "selfDestruct" DATETIME,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_messages" ("channelId", "content", "createdAt", "encryptedKey", "fileUrl", "id", "isDeleted", "iv", "roomId", "selfDestruct", "senderId") SELECT "channelId", "content", "createdAt", "encryptedKey", "fileUrl", "id", "isDeleted", "iv", "roomId", "selfDestruct", "senderId" FROM "messages";
DROP TABLE "messages";
ALTER TABLE "new_messages" RENAME TO "messages";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
