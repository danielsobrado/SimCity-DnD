$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root 'tmp\dev.pid'
$outLog = Join-Path $root 'tmp\dev.out.log'
$errLog = Join-Path $root 'tmp\dev.err.log'
$tmpDir = Join-Path $root 'tmp'

function Get-DevUrl {
  param([string[]]$LogPaths)
  foreach ($path in $LogPaths) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    try {
      $stream = [System.IO.File]::Open(
        $path,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::ReadWrite
      )
      try {
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
      } finally {
        $stream.Dispose()
      }
    } catch {
      continue
    }
    $text = [regex]::Replace($text, '\x1b\[[0-9;]*m', '')
    $match = [regex]::Match($text, 'https?://(?:localhost|127\.0\.0\.1):\d+/?')
    if ($match.Success) {
      return $match.Value.TrimEnd('/')
    }
  }
  return $null
}

New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

if (Test-Path -LiteralPath $pidFile) {
  $existing = 0
  [void][int]::TryParse(
    ((Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1) + ''),
    [ref]$existing
  )
  if ($existing -gt 0 -and (Get-Process -Id $existing -ErrorAction SilentlyContinue)) {
    $url = Get-DevUrl -LogPaths @($outLog, $errLog)
    if ($url) {
      Write-Host "Already running (PID $existing)"
      Write-Host $url
    } else {
      Write-Host "Already running (PID $existing)"
    }
    exit 0
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $outLog,$errLog -Force -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') `
  -WorkingDirectory $root -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog

Set-Content -LiteralPath $pidFile -Value $proc.Id -NoNewline
Write-Host "Started (PID $($proc.Id)) - logs: tmp\dev.out.log / tmp\dev.err.log"

$url = $null
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
  if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
    Write-Host 'Dev server exited before becoming ready. Check tmp\dev.out.log / tmp\dev.err.log'
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    exit 1
  }
  $url = Get-DevUrl -LogPaths @($outLog, $errLog)
  if ($url) { break }
  Start-Sleep -Milliseconds 200
}

if ($url) {
  Write-Host $url
} else {
  Write-Host 'Dev server started, but no URL was detected yet. Check tmp\dev.out.log'
}
