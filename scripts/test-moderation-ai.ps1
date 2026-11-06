# Runs the moderation end-to-end test (rules + AI models) against outputs/test_files.
#
#   .\scripts\test-moderation-ai.ps1 -Mode shadow
#   .\scripts\test-moderation-ai.ps1 -Mode enforce
#   .\scripts\test-moderation-ai.ps1 -Mode both
#   .\scripts\test-moderation-ai.ps1 -Cleanup        # only delete the modtest_clone account and its data
#
# Starts Mongo, Redis and the moderation service in Docker with their ports on localhost, waits for the models,
# then runs apps/web/src/scripts/moderation-ai-test.ts once per mode. Reports land in outputs/test_files/results.
param(
  [ValidateSet('shadow', 'enforce', 'both')] [string]$Mode = 'both',
  [switch]$Cleanup,
  [int]$WaitSeconds = 900
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

docker compose -f docker-compose.yml -f docker-compose.moderation-test.yml --profile moderation up -d mongo redis moderation
if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }

if ($Cleanup) {
  npm --workspace @oremus/web run test:moderation-ai -- --cleanup
  exit $LASTEXITCODE
}

# The first start downloads about 2.5 GB of models, so the service can take a while to answer.
# 127.0.0.1, not localhost: PowerShell tries ::1 first, where Docker does not listen. /health answers 200 while loading too.
Write-Host 'Waiting for the moderation service on http://127.0.0.1:8010 ...'
$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ($true) {
  try {
    $health = Invoke-RestMethod -TimeoutSec 5 http://127.0.0.1:8010/health
    if ($health.status -eq 'ready') { break }
    if ($health.status -eq 'failed') { throw "The moderation models failed to load: $($health.error)" }
  } catch [System.Net.Http.HttpRequestException], [System.Threading.Tasks.TaskCanceledException] {}
  if ((Get-Date) -gt $deadline) { throw "The moderation service did not come up within $WaitSeconds seconds. Check: docker compose logs moderation" }
  Start-Sleep -Seconds 5
}

$modes = if ($Mode -eq 'both') { @('shadow', 'enforce') } else { @($Mode) }
$failed = $false
foreach ($current in $modes) {
  Write-Host "`n===== $current =====" -ForegroundColor Cyan
  npm --workspace @oremus/web run test:moderation-ai -- --mode $current
  if ($LASTEXITCODE -ne 0) { $failed = $true }
}
if ($failed) { exit 1 }
