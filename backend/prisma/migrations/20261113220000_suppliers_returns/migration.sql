BEGIN;

CREATE TABLE "supplier" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "inventoryMovement"
  ADD COLUMN "supplierId" INTEGER,
  ADD COLUMN "unitCost" DECIMAL;

CREATE INDEX "inventoryMovement_supplierId_idx_c4d9a8b9" ON "inventoryMovement"("supplierId");

ALTER TABLE "inventoryMovement"
  ADD CONSTRAINT "inventoryMovement_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "supplier"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "salesReturn" (
  "id" SERIAL NOT NULL,
  "saleId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "refundAmount" DECIMAL NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salesReturn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "salesReturn_saleId_idx_b4c0fb73" ON "salesReturn"("saleId");
CREATE INDEX "salesReturn_userId_idx_a489d58a" ON "salesReturn"("userId");

ALTER TABLE "salesReturn"
  ADD CONSTRAINT "salesReturn_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sale"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "salesReturn"
  ADD CONSTRAINT "salesReturn_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "salesReturnItem" (
  "id" SERIAL NOT NULL,
  "returnId" INTEGER NOT NULL,
  "saleItemId" INTEGER NOT NULL,
  "bookId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL NOT NULL,
  CONSTRAINT "salesReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "salesReturnItem_returnId_idx_721617a6" ON "salesReturnItem"("returnId");
CREATE INDEX "salesReturnItem_saleItemId_idx_c5c0c543" ON "salesReturnItem"("saleItemId");
CREATE INDEX "salesReturnItem_bookId_idx_3eec38a3" ON "salesReturnItem"("bookId");

ALTER TABLE "salesReturnItem"
  ADD CONSTRAINT "salesReturnItem_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "salesReturn"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "salesReturnItem"
  ADD CONSTRAINT "salesReturnItem_saleItemId_fkey"
  FOREIGN KEY ("saleItemId") REFERENCES "saleItem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "salesReturnItem"
  ADD CONSTRAINT "salesReturnItem_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "book"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
