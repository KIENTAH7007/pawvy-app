@echo off
echo.
echo  ================================================
echo     Pawvy - Set Up Automatic Start
echo  ================================================
echo.

:: Get this folder's path (without trailing backslash)
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

:: Remove any old task first
schtasks /delete /tn "Pawvy Business Manager" /f >nul 2>&1

:: Create Task Scheduler task (runs at every login, silently)
schtasks /create ^
  /tn "Pawvy Business Manager" ^
  /tr "cmd /c \"%APP_DIR%\run-server.bat\"" ^
  /sc onlogon ^
  /ru "%USERNAME%" ^
  /rl highest ^
  /f >nul 2>&1

if %ERRORLEVEL% equ 0 (
    echo  [OK] Auto-start set up successfully!
    echo.
    echo  From now on, Pawvy starts silently every time you log in.
    echo  Your browser will open http://localhost:3001 automatically.
    echo.
    echo  ------------------------------------------------
    echo  To start Pawvy RIGHT NOW (without restarting):
    echo    Double-click START-SILENT.vbs
    echo  ------------------------------------------------
    echo.
    echo  To REMOVE auto-start later:
    echo    Open Task Scheduler, find "Pawvy Business Manager", delete it.
    echo.
) else (
    echo  [ERROR] Failed. Please right-click SETUP-AUTOSTART.bat
    echo  and choose "Run as Administrator", then try again.
    echo.
)
pause
