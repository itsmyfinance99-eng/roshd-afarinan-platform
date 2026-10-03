-- An approved calculation run is kept (ST-34.06): it cannot be deleted, neither directly nor by
-- the cascade from its model or from the model's owner.
CREATE FUNCTION "calculation_runs_keep_approved"() RETURNS trigger AS $$
BEGIN
  IF OLD."approvedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'an approved calculation run cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "calculation_runs_keep_approved"
  BEFORE DELETE ON "calculation_runs"
  FOR EACH ROW EXECUTE FUNCTION "calculation_runs_keep_approved"();

-- An approval sets the time and the approver together.
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
