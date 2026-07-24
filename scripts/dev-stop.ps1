$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root 'tmp\dev.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host 'Not running (no PID file)'
  exit 0
}

$processId = 0
[void][int]::TryParse(
  ((Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1) + ''),
  [ref]$processId
)

if ($processId -le 0) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  Write-Host 'Not running (empty PID file)'
  exit 0
}

if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
  & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
  Start-Sleep -Milliseconds 200
  if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
    Write-Host "Failed to stop PID $processId"
    exit 1
  }
  Write-Host "Stopped PID $processId"
} else {
  Write-Host "Process $processId already gone"
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
