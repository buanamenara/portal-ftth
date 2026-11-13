@echo off
title Hapus IRIS Gateway
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\hapus.ps1"
echo.
pause
