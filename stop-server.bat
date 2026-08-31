@echo off
cd /d "%~dp0"
title Stop Huiming Server

echo.
echo  Stopping Huiming server processes...
echo.

REM Only kill node.exe processes whose command line contains both
REM "huiming" and "src/index.ts" (tsx runs src/index.ts).
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*huiming*' -and $_.CommandLine -like '*src/index.ts*' }); if ($p.Count -gt 0) { $p | ForEach-Object { Write-Host ('  Killed PID: ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }; Write-Host ('  Killed ' + $p.Count + ' Huiming server process(es).') } else { Write-Host '  No running Huiming server process found.' }"

echo.
echo  Press any key to close...
pause >nul
endlocal
