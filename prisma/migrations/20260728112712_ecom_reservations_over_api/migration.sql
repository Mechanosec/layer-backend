/*
  Warnings:

  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "RecalculationTaskStatus" AS ENUM ('PENDING', 'DONE', 'ABANDONED');

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_variantId_fkey";

-- AlterTable
ALTER TABLE "EcomStock" ADD COLUMN     "reservationsStale" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "OrderItem";

-- DropEnum
DROP TYPE "OrderStatus";

-- CreateTable
CREATE TABLE "StockRecalculationTask" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "variantCode" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL,
    "status" "RecalculationTaskStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastTriedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockRecalculationTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockRecalculationTask_status_updatedAt_idx" ON "StockRecalculationTask"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockRecalculationTask_variantId_regionId_key" ON "StockRecalculationTask"("variantId", "regionId");

-- AddForeignKey
ALTER TABLE "StockRecalculationTask" ADD CONSTRAINT "StockRecalculationTask_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRecalculationTask" ADD CONSTRAINT "StockRecalculationTask_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;
