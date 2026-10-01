param(
  [string]$OutputDir = "dist\releases"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $root "package.json"))) {
  throw "Silvia-Projekt nicht gefunden: $root"
}

$status = (& git -C $root status --porcelain)
if ($LASTEXITCODE -ne 0) { throw "Git-Status konnte nicht gelesen werden." }
if ($status) {
  throw "Release nur aus sauberem Checkout moeglich. Erst lokale Aenderungen committen oder bewusst entfernen."
}

$commit = (& git -C $root rev-parse --short HEAD).Trim()
if (-not $commit) { throw "Kein Git-Commit gefunden." }

$absoluteOutputDir = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $absoluteOutputDir | Out-Null
$archiveName = "silvia-$commit.zip"
$archivePath = Join-Path $absoluteOutputDir $archiveName
if (Test-Path $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

& git -C $root archive --format=zip --prefix="silvia-$commit/" --output="$archivePath" HEAD -- . ':(exclude).silvia-data.backup/**'
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $archivePath)) {
  throw "Release-ZIP konnte nicht erstellt werden."
}

$size = (Get-Item -LiteralPath $archivePath).Length
Write-Output (ConvertTo-Json @{
  ok = $true
  commit = $commit
  archive = $archivePath
  bytes = $size
  source = "git archive (nur versionierte Dateien)"
} -Compress)
