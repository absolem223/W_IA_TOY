@echo off
cd /d "C:\Users\Nahuel\.gemini\antigravity\scratch\widget-ia-toy"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\argos-selector.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: No se pudo ejecutar argos-selector.ps1
    pause
)
