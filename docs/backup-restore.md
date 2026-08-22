# PostgreSQL Backup and Restore Verification

Run a logical backup/restore drill at least quarterly and before a high-risk production migration.

```powershell
cd C:\Projects\Project_Journal_Web
$env:DATABASE_URL = 'postgresql://...'
pnpm test:backup-restore
```

The script creates a custom-format `pg_dump` in a unique OS temporary directory, restores it into a uniquely named `aksara_restore_verify_YYYYMMDDHHMMSS` database, compares completed Prisma migration counts, verifies the public table count, drops only that validated temporary database, and removes the temporary dump. It never drops or modifies the source database.

Production operations must additionally verify the provider backup schedule and point-in-time recovery window, record the encrypted artifact location and retention, perform the restore into an isolated account/project, and attach timestamps plus operator identity to the change record. Never restore over production as a test.
