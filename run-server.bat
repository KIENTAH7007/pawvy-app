@echo off
cd /d "%~dp0"
echo [%DATE% %TIME%] Pawvy server starting... >> "%~dp0\pawvy-log.txt"

:: Find node.exe - check common install locations
set "NODE_EXE=node"
if exist "C:\Program Files\nodejs\node.exe"     set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"

:: Run the server and log all output
"%NODE_EXE%" server\index.js >> "%~dp0\pawvy-log.txt" 2>&1
echo [%DATE% %TIME%] Pawvy server stopped. >> "%~dp0\pawvy-log.txt"
