# Database bootstrap

Application startup and database setup no longer create sample tournaments, players, staff, fans, registrations, schedules, predictions or guidelines. Demo seed files and their npm commands have been removed.

`npm run bootstrap:admin` (also the Prisma seed entry point) creates an administrator only when both `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` are configured. `SUPER_ADMIN_NAME` is optional. With neither credential configured it performs no database writes. Existing administrators are preserved.

`npm run bootstrap:security-guard` requires `SECURITY_GUARD_EMAIL`, `SECURITY_GUARD_PASSWORD`, `SECURITY_GUARD_NAME` and `SECURITY_GUARD_PHONE`. It creates only that explicitly configured account and does not overwrite an existing account.

Automated tests retain isolated mock data. Bracket placeholders such as `TBD`, BYE and unresolved qualifier labels are competition state, not sample registrations.

Removing seed source files does not remove records previously inserted into a database. Existing records must be identified from seed ownership evidence before cleanup; authentic registrations, payments and user-created records must not be deleted based on a similar display name alone.
