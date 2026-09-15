@echo off
cd /d "%~dp0"
title Stop Tongzhuo Server

echo.
echo  Stopping Tongzhuo server processes...
echo.

REM Only kill node.exe processes whose command line contains both
REM "huiming" and "src/index.ts" (tsx runs src/index.ts). Here "huiming"
REM matches the repo FOLDER name (…\huiming\server\src\index.ts), not the
REM platform name; update it if you rename the folder.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*huiming*' -and $_.CommandLine -like '*src/index.ts*' }); if ($p.Count -gt 0) { $p | ForEach-Object { Write-Host ('  Killed PID: ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }; Write-Host ('  Killed ' + $p.Count + ' Tongzhuo server process(es).') } else { Write-Host '  No running Tongzhuo server process found.' }"

echo.
echo  Press any key to close...
pause >nul
endlocal
