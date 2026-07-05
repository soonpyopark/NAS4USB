@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "PORT=3008"

if exist "%ROOT%.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ROOT%.env") do (
    if /I "%%~A"=="PORT" set "PORT=%%~B"
  )
)

echo NAS4USB / EduCowork 서버 중지 (TCP !PORT!)...

set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /C:":!PORT! " ^| findstr LISTENING') do (
  set "FOUND=1"
  echo PID %%P 종료 중...
  taskkill /PID %%P /T /F >nul 2>&1
  if errorlevel 1 (
    echo PID %%P 종료 실패 — 관리자 권한이 필요할 수 있습니다.
  )
)

if "!FOUND!"=="0" (
  echo 포트 !PORT! 에서 실행 중인 서버가 없습니다.
) else (
  echo 서버를 중지했습니다.
)

pause
