-- An email identifies one account across all account roles. Application-level
-- checks provide a friendly ConflictException; this trigger also serializes
-- concurrent writes and enforces the invariant in PostgreSQL itself.
CREATE OR REPLACE FUNCTION enforce_global_account_email_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_email text;
  account_table text;
  account_id_column text;
  current_account_id text;
  email_exists boolean;
BEGIN
  normalized_email := lower(btrim(NEW."email"));
  NEW."email" := normalized_email;

  -- Serialize account writes for the same normalized email across all four
  -- tables so two concurrent requests cannot both pass the availability check.
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized_email, 0));

  FOR account_table, account_id_column IN
    SELECT * FROM (VALUES
      ('Fan', 'fanId'),
      ('Player', 'playerId'),
      ('Employee', 'employeeId'),
      ('Admin', 'adminId')
    ) AS account_tables(table_name, id_column)
  LOOP
    current_account_id := NULL;
    IF account_table = TG_TABLE_NAME THEN
      current_account_id := to_jsonb(NEW) ->> account_id_column;
    END IF;

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I WHERE lower(btrim("email")) = $1 AND ($2 IS NULL OR %I::text <> $2))',
      account_table,
      account_id_column
    )
    INTO email_exists
    USING normalized_email, current_account_id;

    IF email_exists THEN
      RAISE EXCEPTION 'This email is already registered to an account.'
        USING ERRCODE = '23505', CONSTRAINT = 'global_account_email_unique';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER fan_global_account_email_unique
BEFORE INSERT OR UPDATE OF "email" ON "Fan"
FOR EACH ROW EXECUTE FUNCTION enforce_global_account_email_uniqueness();

CREATE TRIGGER player_global_account_email_unique
BEFORE INSERT OR UPDATE OF "email" ON "Player"
FOR EACH ROW EXECUTE FUNCTION enforce_global_account_email_uniqueness();

CREATE TRIGGER employee_global_account_email_unique
BEFORE INSERT OR UPDATE OF "email" ON "Employee"
FOR EACH ROW EXECUTE FUNCTION enforce_global_account_email_uniqueness();

CREATE TRIGGER admin_global_account_email_unique
BEFORE INSERT OR UPDATE OF "email" ON "Admin"
FOR EACH ROW EXECUTE FUNCTION enforce_global_account_email_uniqueness();
