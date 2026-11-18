-- Fan and Player are two linked views of one customer's account. They may
-- share an email, while duplicate accounts of the same role remain forbidden.
-- Staff and admin emails remain globally exclusive against every account role.
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

  -- Serialize writes for the same normalized email across all account tables.
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized_email, 0));

  FOR account_table, account_id_column IN
    SELECT * FROM (VALUES
      ('Fan', 'fanId'),
      ('Player', 'playerId'),
      ('Employee', 'employeeId'),
      ('Admin', 'adminId')
    ) AS account_tables(table_name, id_column)
  LOOP
    -- A Fan and its corresponding Player can have the same email. The table's
    -- own unique constraint and the application check still prevent duplicates
    -- within either role.
    IF TG_TABLE_NAME IN ('Fan', 'Player')
      AND account_table IN ('Fan', 'Player')
      AND account_table <> TG_TABLE_NAME THEN
      CONTINUE;
    END IF;

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
