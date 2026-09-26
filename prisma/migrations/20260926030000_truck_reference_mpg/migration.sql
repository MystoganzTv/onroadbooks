-- AlterTable
-- ADR-0030: the owner's reference MPG per truck. Null until entered; never estimated.
ALTER TABLE "Truck" ADD COLUMN "referenceMpg" DECIMAL(5,2);
