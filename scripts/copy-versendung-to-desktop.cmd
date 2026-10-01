@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0copy-versendung-to-desktop.ps1"
if errorlevel 1 pause
