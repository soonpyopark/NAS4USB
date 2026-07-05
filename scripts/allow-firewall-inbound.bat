@echo off
chcp 65001 >nul
setlocal EnableExtensions

set "ROOT=%~dp0"
set "PORT=3008"

if exist "%ROOT%.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ROOT%.env") do (
    if /I "%%~A"=="PORT" set "PORT=%%~B"
  )
)

echo EduCowork LAN TCP %PORT% 인바운드 허용 (관리자 권한 필요)
netsh advfirewall firewall add rule name="EduCowork LAN (%PORT%)" dir=in action=allow protocol=TCP localport=%PORT%
if errorlevel 1 (
  echo 방화벽 규칙 추가에 실패했습니다. 관리자 권한으로 다시 실행해 주세요.
) else (
  echo 완료: EduCowork LAN (%PORT%)
)
pause
