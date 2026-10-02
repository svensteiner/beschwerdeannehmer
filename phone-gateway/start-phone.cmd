@echo off
REM Silvia Telefonie-Gateway starten (AP 25).
REM Ohne Argumente: Registrar-loser Mock-Test mit dem Pflicht-Testsatz.
REM Mit "sip": echte SIP-Registrierung (siehe .env).

cd /d "%~dp0"

if not exist .env (
  echo [WARNUNG] .env fehlt - kopiere .env.example nach .env und trage Werte ein.
)

if "%1"=="sip" (
  python phone_gateway.py --sip
) else (
  if "%1"=="" (
    echo Erzeuge Mock-Anruf ...
    python mock\make_mock_call.py out\mock-anruf.wav
    python phone_gateway.py --mock out\mock-anruf.wav
  ) else (
    python phone_gateway.py --mock %1
  )
)
