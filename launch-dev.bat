@echo off
:: Widget IA Toy — Dev Launcher
:: Double-click this file to start the app in development mode.
:: A terminal window will appear briefly while Electron loads, then it will minimize.

title Widget IA Toy — Dev
cd /d "%~dp0"

echo Starting Widget IA Toy in dev mode...
npm run dev

:: Keep window open if there was an error
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Something went wrong. See output above.
    pause
)
