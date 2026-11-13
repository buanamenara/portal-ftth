@echo off
rem Pelari IRIS Gateway (dijalankan tersembunyi oleh "IRIS Gateway.vbs"). Bila program berhenti, dinyalakan lagi 5 detik kemudian.
rem Hanya satu pelari per folder: pelari.lock dipegang selama pelari hidup; pelari kedua langsung selesai.
rem Kode keluar 3 = gateway lain (mis. versi lama) sudah memakai port panel -> pelari ini selesai.
setlocal
set "ROOT=%~dp0.."
set "IRIS_DATA=%ROOT%\data"
set "LOG=%ROOT%\data\gateway.log"
if not exist "%IRIS_DATA%" mkdir "%IRIS_DATA%"
2>nul (9>"%IRIS_DATA%\pelari.lock" call :jalan) || exit /b 0
exit /b 0

:jalan
for %%A in ("%LOG%") do if %%~zA GTR 5000000 move /y "%LOG%" "%LOG%.lama" >nul
"%ROOT%\node\node.exe" "%ROOT%\app\gateway.mjs" >> "%LOG%" 2>&1
if "%errorlevel%"=="3" exit /b 0
echo %date% %time% - gateway berhenti (kode %errorlevel%), dinyalakan ulang 5 detik lagi >> "%LOG%"
ping -n 6 127.0.0.1 >nul
goto jalan
