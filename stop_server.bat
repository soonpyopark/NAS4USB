@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "PORT=3009"

if exist "%ROOT%.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ROOT%.env") do (
    if /I "%%~A"=="PORT" set "PORT=%%~B"
  )
)

echo Stopping NAS4USB server on TCP !PORT!...

set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /C:":!PORT! " ^| findstr LISTENING') do (
  set "FOUND=1"
  echo Killing PID %%P...
  taskkill /PID %%P /T /F >nul 2>&1
  if errorlevel 1 (
    echo Failed to kill PID %%P - try Run as administrator.
  )
)

if "!FOUND!"=="0" (
  echo No server listening on port !PORT!.
) else (
  echo Server stopped.
)

pause
