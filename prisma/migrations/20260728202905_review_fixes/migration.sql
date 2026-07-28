-- DropIndex
DROP INDEX "ProductVariant_barcodeNo_key";

-- AlterTable
ALTER TABLE "EcomStockOutbox" ADD COLUMN     "regionId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "ProductVariant" DROP COLUMN "price";

-- CreateIndex
CREATE INDEX "ProductVariant_barcodeNo_idx" ON "ProductVariant"("barcodeNo");

