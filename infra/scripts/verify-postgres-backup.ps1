param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'
if (-not $DatabaseUrl) { throw 'DATABASE_URL is required.' }
$source = [Uri]$DatabaseUrl
$sourceDatabase = $source.AbsolutePath.Trim('/')
if (-not $sourceDatabase) { throw 'DATABASE_URL must name a database.' }
$userInfo = $source.UserInfo.Split(':', 2)
$username = [Uri]::UnescapeDataString($userInfo[0])
if ($userInfo.Count -gt 1) { $env:PGPASSWORD = [Uri]::UnescapeDataString($userInfo[1]) }
$hostName = $source.Host
$port = if ($source.Port -gt 0) { $source.Port } else { 5432 }

function Resolve-PostgresTool([string]$name) {
  $candidate = Join-Path $PostgresBin ($name + '.exe')
  if (Test-Path -LiteralPath $candidate) { return $candidate }
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  throw "PostgreSQL tool not found: $name"
}

function Assert-NativeSuccess([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE." }
}

$pgDump = Resolve-PostgresTool 'pg_dump'
$pgRestore = Resolve-PostgresTool 'pg_restore'
$createDb = Resolve-PostgresTool 'createdb'
$dropDb = Resolve-PostgresTool 'dropdb'
$psql = Resolve-PostgresTool 'psql'
$restoreDatabase = 'aksara_restore_verify_' + (Get-Date -Format 'yyyyMMddHHmmss')
if ($restoreDatabase -notmatch '^aksara_restore_verify_[0-9]{14}$') {
  throw 'Unsafe restore database name.'
}
$tempDirectory = Join-Path ([IO.Path]::GetTempPath()) ('aksara-backup-' + [Guid]::NewGuid().ToString('N'))
$dumpPath = Join-Path $tempDirectory 'aksara.dump'
New-Item -ItemType Directory -Path $tempDirectory | Out-Null

try {
  & $pgDump --format=custom --no-owner --no-privileges --file=$dumpPath $DatabaseUrl
  Assert-NativeSuccess 'pg_dump'
  if ((Get-Item -LiteralPath $dumpPath).Length -lt 1024) { throw 'Backup artifact is unexpectedly small.' }

  & $createDb --host=$hostName --port=$port --username=$username --maintenance-db=postgres $restoreDatabase
  Assert-NativeSuccess 'createdb'
  & $pgRestore --host=$hostName --port=$port --username=$username --dbname=$restoreDatabase --no-owner --no-privileges $dumpPath
  Assert-NativeSuccess 'pg_restore'

  $sourceMigrations = & $psql $DatabaseUrl --tuples-only --no-align --command='SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;'
  Assert-NativeSuccess 'source verification'
  $restoredMigrations = & $psql --host=$hostName --port=$port --username=$username --dbname=$restoreDatabase --tuples-only --no-align --command='SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;'
  Assert-NativeSuccess 'restore verification'
  $restoredTables = & $psql --host=$hostName --port=$port --username=$username --dbname=$restoreDatabase --tuples-only --no-align --command="SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
  Assert-NativeSuccess 'table verification'
  if ($sourceMigrations.Trim() -ne $restoredMigrations.Trim()) { throw 'Migration history count differs after restore.' }
  if ([int]$restoredTables.Trim() -lt 10) { throw 'Restored schema has too few public tables.' }

  [PSCustomObject]@{
    Status = 'passed'
    SourceDatabase = $sourceDatabase
    RestoreDatabase = $restoreDatabase
    AppliedMigrations = [int]$restoredMigrations.Trim()
    PublicTables = [int]$restoredTables.Trim()
    DumpBytes = (Get-Item -LiteralPath $dumpPath).Length
  }
}
finally {
  & $dropDb --host=$hostName --port=$port --username=$username --maintenance-db=postgres --if-exists $restoreDatabase
  if (Test-Path -LiteralPath $tempDirectory) {
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force
  }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
