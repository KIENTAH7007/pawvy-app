@echo off
title Pawvy Business Manager
echo.
echo  ================================================
echo     PAWVY Business Manager - Starting up...
echo  ================================================
echo.

:: Test Node.js by actually running it (more reliable than 'where')
node --version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js not found. Please install from https://nodejs.org
    echo  Download the LTS version, install with defaults, restart PC, try again.
    echo.
    pause
    exit /b 1
)
echo  [OK] Node.js detected.

:: Install packages only if express is missing
if not exist "node_modules\express" (
    echo  [INFO] Installing packages (first time, ~1 min)...
    call npm install --omit=dev
    if %ERRORLEVEL% neq 0 (
        echo  [ERROR] Install failed. Check internet connection.
        pause
        exit /b 1
    )
    echo  [OK] Packages ready.
)

echo.
echo  [INFO] Server starting... browser opens in 6 seconds.
echo  [INFO] Keep this window open while using Pawvy.
echo  [INFO] To stop: close this window.
echo.

:: Open browser after 6s delay (background)
start /b cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:3001"

:: Start server (foreground - keeps window alive)
node server/index.js

echo.
echo  Server stopped. Press any key to close.
pause >nul
