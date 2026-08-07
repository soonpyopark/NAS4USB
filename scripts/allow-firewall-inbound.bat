@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "PORT=3009"

if exist "%ROOT%.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ROOT%.env") do (
    if /I "%%~A"=="PORT" set "PORT=%%~B"
  )
)

echo NAS4USB firewall: allow inbound TCP %PORT%
echo Folder: %ROOT%
echo Run as Administrator if the rule fails to add.
echo.

netsh advfirewall firewall add rule name="NAS4USB LAN (%PORT%)" dir=in action=allow protocol=TCP localport=%PORT%
if errorlevel 1 (
  echo FAILED - right-click this file and choose "Run as administrator".
) else (
  echo OK - NAS4USB LAN TCP %PORT% allowed.
)
pause
