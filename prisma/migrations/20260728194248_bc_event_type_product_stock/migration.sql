-- AlterEnum
BEGIN;
CREATE TYPE "BcEventType_new" AS ENUM ('PRODUCT', 'STOCK');
ALTER TABLE "BcEvent" ALTER COLUMN "type" TYPE "BcEventType_new" USING ("type"::text::"BcEventType_new");
ALTER TYPE "BcEventType" RENAME TO "BcEventType_old";
ALTER TYPE "BcEventType_new" RENAME TO "BcEventType";
DROP TYPE "public"."BcEventType_old";
COMMIT;

