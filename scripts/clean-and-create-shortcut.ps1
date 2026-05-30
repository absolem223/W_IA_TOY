$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$startMenuPath = [System.Environment]::GetFolderPath('StartMenu')
$currentDir = Get-Location

Write-Host "--- Argos Desktop Shortcut Manager ---"

# 1. Clean up old/legacy shortcuts
Write-Host "Cleaning up legacy shortcuts..."
$oldShortcuts = @(
    "ArgOS.lnk",
    "Argos.lnk",
    "Widget IA Toy.lnk",
    "Widget IA.lnk",
    "ArgOS Launcher.lnk"
)

foreach ($name in $oldShortcuts) {
    $desktopShortcut = Join-Path $desktopPath $name
    if (Test-Path $desktopShortcut) {
        Remove-Item -Path $desktopShortcut -Force
        Write-Host "Removed legacy desktop shortcut: $desktopShortcut"
    }

    $startShortcut = Join-Path $startMenuPath "Programs\$name"
    if (Test-Path $startShortcut) {
        Remove-Item -Path $startShortcut -Force
        Write-Host "Removed legacy Start Menu shortcut: $startShortcut"
    }
}

# 2. Create new, clean native shortcut on Desktop pointing directly to Argos.exe
$targetExe = Join-Path $currentDir "dist\win-unpacked\Argos.exe"
if (-not (Test-Path $targetExe)) {
    Write-Error "Argos.exe not found at $targetExe. Please run 'npm run build:local' first."
    Exit 1
}

$newShortcutPath = Join-Path $desktopPath "Argos.lnk"
Write-Host "Creating new native desktop shortcut at: $newShortcutPath"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($newShortcutPath)
$Shortcut.TargetPath = $targetExe
$Shortcut.WorkingDirectory = Join-Path $currentDir "dist\win-unpacked"
$Shortcut.IconLocation = Join-Path $currentDir "resources\icon.ico"
$Shortcut.Description = "Argos Desktop Companion"
$Shortcut.Save()

Write-Host "SUCCESS: Native desktop shortcut created successfully pointing directly to: $targetExe"
