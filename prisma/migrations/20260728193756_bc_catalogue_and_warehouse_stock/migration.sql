-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "customCategoryCode" TEXT,
ADD COLUMN     "customCategoryCodeDescription" TEXT,
ADD COLUMN     "division" TEXT,
ADD COLUMN     "price" DECIMAL(14,2),
ADD COLUMN     "retailProductCode" TEXT,
ADD COLUMN     "seasonId" UUID,
ADD COLUMN     "unitMeasure" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" DROP COLUMN "customCategoryCode",
DROP COLUMN "customCategoryCodeDescription",
DROP COLUMN "metadata",
DROP COLUMN "unitMeasure",
ADD COLUMN     "barcodeNo" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "size" TEXT;

-- CreateTable
CREATE TABLE "Season" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" DATE,
    "endsAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Season_name_key" ON "Season"("name");

-- CreateIndex
CREATE INDEX "Product_seasonId_idx" ON "Product"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_barcodeNo_key" ON "ProductVariant"("barcodeNo");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

