-- CreateEnum
CREATE TYPE "WhatsappProviderType" AS ENUM ('META_CLOUD_API', 'SESSION_PROVIDER');

-- CreateEnum
CREATE TYPE "WhatsappSessionStatus" AS ENUM ('PENDING', 'QR_PENDING', 'CONNECTED', 'DISCONNECTED', 'FAILED');

-- CreateTable
CREATE TABLE "WhatsappSession" (
    "id" TEXT NOT NULL,
    "provider" "WhatsappProviderType" NOT NULL,
    "status" "WhatsappSessionStatus" NOT NULL DEFAULT 'PENDING',
    "phoneNumber" TEXT,
    "qrCode" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "externalSessionId" TEXT,
    "tenantId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsappSession_pkey" PRIMARY KEY ("id")
);
