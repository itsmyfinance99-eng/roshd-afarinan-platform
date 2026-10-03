-- Four eyes (owner decision 2026-10-03, OQ-40): a calculation run is approved by someone other
-- than the user who calculated it. The function is replaced as a whole; only the last rule is new.
CREATE OR REPLACE FUNCTION "calculation_runs_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."modelId" IS DISTINCT FROM OLD."modelId"
    OR NEW."number" IS DISTINCT FROM OLD."number"
    OR NEW."modelVersion" IS DISTINCT FROM OLD."modelVersion"
    OR NEW."input" IS DISTINCT FROM OLD."input"
    OR NEW."inputHash" IS DISTINCT FROM OLD."inputHash"
    OR NEW."engineVersion" IS DISTINCT FROM OLD."engineVersion"
    OR NEW."results" IS DISTINCT FROM OLD."results"
    OR NEW."warnings" IS DISTINCT FROM OLD."warnings"
    OR NEW."defaultsUsed" IS DISTINCT FROM OLD."defaultsUsed"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (NEW."createdById" IS DISTINCT FROM OLD."createdById" AND NEW."createdById" IS NOT NULL)
  THEN
    RAISE EXCEPTION 'calculation_runs rows are immutable';
  END IF;
  IF OLD."approvedAt" IS NOT NULL AND (
    NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
    OR (NEW."approvedById" IS DISTINCT FROM OLD."approvedById" AND NEW."approvedById" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'an approved calculation run is locked';
  END IF;
  IF OLD."approvedAt" IS NULL AND (NEW."approvedAt" IS NULL) <> (NEW."approvedById" IS NULL) THEN
    RAISE EXCEPTION 'an approval needs both its time and its approver';
  END IF;
  IF OLD."approvedAt" IS NULL AND NEW."approvedAt" IS NOT NULL
    AND NEW."approvedById" = OLD."createdById"
  THEN
    RAISE EXCEPTION 'a calculation run is approved by someone other than its creator';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
