@echo off
setlocal
cd /d "%~dp0"
title Tongzhuo Online Server

REM ============================================================
REM  Tongzhuo Online Server - separate deployment
REM  ----------------------------------------------------------
REM  Fixed port to expose for online play.
REM    LAN access : other devices connect to http://<host-ip>:<port>
REM    NAT tunnel : map <port> via cpolar/frp/ngrok, then give others
REM                 the public domain to connect through
REM  Optional: override the default port with a CLI arg, e.g.
REM     start-server.bat 3002
REM ============================================================

set PORT=3001

if not "%1"=="" set PORT=%1

echo.
echo  Tongzhuo Online Server
echo  ------------------------------------------
echo  1. Stopping any existing server process...
REM The matcher below uses '*huiming*' because it matches the repo FOLDER name
REM inside the node command line (…\huiming\server\src\index.ts), not the
REM platform name. Update it if you rename the folder.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*huiming*' -and $_.CommandLine -like '*src/index.ts*' }); if ($p.Count -gt 0) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Write-Host ('    Killed ' + $p.Count + ' old server process(es).') } else { Write-Host '    No old server process found.' }"

echo  2. Building client with latest code...
call npm run build
if errorlevel 1 (
  echo    Build FAILED. Aborting.
  goto END
)

echo  3. Starting server on port %PORT% ...
echo  ------------------------------------------
echo  Listen port   : %PORT%
echo  LAN access    : http://HOST_IP:%PORT%
echo  Localhost     : http://127.0.0.1:%PORT%
echo  NAT tunnel    : map port %PORT% to public, then use public domain
echo  ------------------------------------------
echo  Server is starting... Keep this window open.
echo  Open in browser: http://127.0.0.1:%PORT%
echo  Press Ctrl+C to stop
echo.

call npm run server

:END
echo.
echo  The server stopped. Look at the messages above.
pause
endlocal
