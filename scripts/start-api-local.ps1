$repositoryRoot = Split-Path $PSScriptRoot -Parent
Get-Content (Join-Path $repositoryRoot '.env') |
  Where-Object { $_ -and -not $_.StartsWith('#') -and $_.Contains('=') } |
  ForEach-Object {
    $entry = $_.Split('=', 2)
    [Environment]::SetEnvironmentVariable($entry[0], $entry[1], 'Process')
  }

$env:npm_config_engine_strict = 'false'
Set-Location $repositoryRoot
pnpm --filter @aksara/api dev
