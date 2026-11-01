@echo off
REM Stops the viewer, for when its window is gone and Ctrl+C is no longer an option.
REM
REM PowerShell rather than parsing netstat: netstat output is localised, so "LISTENING" is called
REM something else on a German Windows and text matching would silently fail.
REM Deliberately one long line — caret line continuation inside quoted strings is fragile in cmd.

powershell -NoProfile -Command "$p = Get-NetTCPConnection -LocalPort 4111 -State Listen -ErrorAction SilentlyContinue; if ($p) { $p.OwningProcess | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force; Write-Host \"Stopped process $_ - port 4111 is free again.\" } } else { Write-Host 'Nothing is listening on port 4111.' }"

echo.
pause
