-- The day the dispatch commission was paid to the dispatcher; null while owed.
ALTER TABLE "Load" ADD COLUMN "dispatchPaidDate" DATE;
