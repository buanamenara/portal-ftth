@echo off
rem Pelari IRIS Gateway (dijalankan tersembunyi oleh "IRIS Gateway.vbs"). Bila program berhenti, dinyalakan lagi 5 detik kemudian.
rem Hanya satu pelari per folder: pelari.lock dipegang selama pelari hidup; pelari kedua langsung selesai.
rem Sebelum mulai, gateway lama (start.bat / folder IRIS lain) di laptop ini dihentikan otomatis (bin\ambil-alih.ps1).
rem Kode keluar 4 = "Tutup program" dari panel -> pelari selesai. Kode 3 = port panel dipakai program lain.
setlocal
set "ROOT=%~dp0.."
set "IRIS_DATA=%ROOT%\data"
set "LOG=%ROOT%\data\gateway.log"
set "COBA3=0"
if not exist "%IRIS_DATA%" mkdir "%IRIS_DATA%"
2>nul (9>"%IRIS_DATA%\pelari.lock" call :mulai) || exit /b 0
exit /b 0

:mulai
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ambil-alih.ps1" >> "%LOG%" 2>&1
:jalan
for %%A in ("%LOG%") do if %%~zA GTR 5000000 move /y "%LOG%" "%LOG%.lama" >nul
"%ROOT%\node\node.exe" "%ROOT%\app\gateway.mjs" >> "%LOG%" 2>&1
set "KODE=%errorlevel%"
if "%KODE%"=="4" exit /b 0
if "%KODE%"=="3" (
  if "%COBA3%"=="1" exit /b 0
  set "COBA3=1"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ambil-alih.ps1" >> "%LOG%" 2>&1
  goto jalan
)
set "COBA3=0"
echo %date% %time% - gateway berhenti (kode %KODE%), dinyalakan ulang 5 detik lagi >> "%LOG%"
ping -n 6 127.0.0.1 >nul
goto jalan
