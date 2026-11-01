@echo off
REM Double-click launcher for the viewer.
REM The server opens the browser itself once it is listening.

cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies, one moment...
  call npm install
)

REM --watch restarts the server whenever a file changes, so edits show up without
REM stopping and starting by hand.
node --watch server.js

echo.
echo Server stopped. If the port stayed busy, run stop.cmd.
pause
