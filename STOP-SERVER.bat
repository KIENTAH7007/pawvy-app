@echo off
echo Stopping Pawvy server...
taskkill /f /im node.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Server stopped.
) else (
    echo [INFO] Server was not running.
)
timeout /t 2 /nobreak >nul
