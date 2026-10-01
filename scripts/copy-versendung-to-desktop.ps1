# Copies the colleague pack onto THIS Windows PC's Desktop.
# Run in PowerShell after git pull:
#   cd C:\silvia
#   powershell -ExecutionPolicy Bypass -File .\scripts\copy-versendung-to-desktop.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "package.json"))) {
  $root = "C:\silvia"
}
if (-not (Test-Path (Join-Path $root "package.json"))) {
  Write-Error "Silvia-Ordner nicht gefunden. Erst: cd C:\silvia"
}

$dest = Join-Path $env:USERPROFILE "Desktop\Versendung"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$pitch = Join-Path $root "docs\Silvia-Pitch.pptx"
$film = Join-Path $root "public\videos\silvia.mp4"
$demo = Join-Path $root "docs\versendung\3_Silvia-Demo-Startseite-und-Film.mp4"

if (-not (Test-Path $pitch)) { Write-Error "Pitch fehlt: $pitch  (git pull?)" }
if (-not (Test-Path $film)) { Write-Error "Werbefilm fehlt: $film  (git pull?)" }

Copy-Item $pitch (Join-Path $dest "1_Silvia-Pitch.pptx") -Force
Copy-Item $film (Join-Path $dest "2_Silvia-Werbefilm-32-Sekunden.mp4") -Force

if (Test-Path $demo) {
  Copy-Item $demo (Join-Path $dest "3_Silvia-Demo-Startseite-und-Film.mp4") -Force
} else {
  Write-Host "Hinweis: Demo-Video noch nicht im Repo. Werbefilm und Pitch liegen schon in $dest"
}

$readme = @"
Silvia – Paket für den Kollegen

  1_Silvia-Pitch.pptx                  zentraler Pitch für Pilotpartner
  2_Silvia-Werbefilm-32-Sekunden.mp4   32 s, 1080p, mit Ton
  3_Silvia-Demo-Startseite-und-Film.mp4   Homepage + Film im Browser

Diese drei Dateien weiterleiten. Keine Fail-Screenshots, keine echten Handynummern.
"@
Set-Content -Path (Join-Path $dest "LIESMICH.txt") -Value $readme -Encoding UTF8

Write-Host "Fertig: $dest"
Invoke-Item $dest
