CREATE TYPE "IntegrationScope" AS ENUM ('READ', 'WRITE');
CREATE TABLE "IntegrationKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "scopes" "IntegrationScope"[] NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IntegrationKey_tokenHash_key" ON "IntegrationKey"("tokenHash");
CREATE INDEX "IntegrationKey_userId_createdAt_idx" ON "IntegrationKey"("userId", "createdAt");
CREATE TABLE "IntegrationRequest" (
  "id" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationRequest_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "IntegrationKey"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IntegrationRequest_keyId_requestId_key" ON "IntegrationRequest"("keyId", "requestId");
