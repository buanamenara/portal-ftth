@echo off
rem Gateway WhatsApp Portal Waspang. Jendela ini harus tetap terbuka; bila program berhenti, dijalankan ulang otomatis.
cd /d "%~dp0"
title Gateway WhatsApp Portal Waspang
:ulang
node gateway.mjs
if errorlevel 2 (
  echo Perangkat dikeluarkan dari WhatsApp. Hapus folder auth lalu jalankan start.bat lagi.
  pause
  exit /b
)
echo Gateway berhenti, dijalankan ulang 10 detik lagi...
timeout /t 10 /nobreak >nul
goto ulang
