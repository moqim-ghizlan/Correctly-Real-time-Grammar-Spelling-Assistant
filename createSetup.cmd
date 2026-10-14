@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-setup.ps1"
set "setupExit=%errorlevel%"
echo.
if not "%setupExit%"=="0" echo La creation a echoue. Consulte les messages ci-dessus.
pause
exit /b %setupExit%
