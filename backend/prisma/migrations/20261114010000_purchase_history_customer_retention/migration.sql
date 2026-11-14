BEGIN;

ALTER TABLE "customer"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE "sale"
  ADD COLUMN "customerName" TEXT,
  ADD COLUMN "customerTaxId" TEXT;

CREATE TABLE "supplierPurchase" (
  "id" SERIAL NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "invoiceNumber" TEXT,
  "notes" TEXT,
  "subtotal" DECIMAL NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplierPurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplierPurchase_supplierId_idx_c4d9a8b9" ON "supplierPurchase"("supplierId");
CREATE INDEX "supplierPurchase_userId_idx_a489d58a" ON "supplierPurchase"("userId");

ALTER TABLE "supplierPurchase"
  ADD CONSTRAINT "supplierPurchase_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "supplier"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplierPurchase"
  ADD CONSTRAINT "supplierPurchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "supplierPurchaseItem" (
  "id" SERIAL NOT NULL,
  "purchaseId" INTEGER NOT NULL,
  "bookId" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL NOT NULL,
  "total" DECIMAL NOT NULL,
  CONSTRAINT "supplierPurchaseItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplierPurchaseItem_purchaseId_idx_10cddd2f" ON "supplierPurchaseItem"("purchaseId");
CREATE INDEX "supplierPurchaseItem_bookId_idx_3eec38a3" ON "supplierPurchaseItem"("bookId");

ALTER TABLE "supplierPurchaseItem"
  ADD CONSTRAINT "supplierPurchaseItem_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "supplierPurchase"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplierPurchaseItem"
  ADD CONSTRAINT "supplierPurchaseItem_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "book"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
