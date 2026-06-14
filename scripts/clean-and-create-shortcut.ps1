# =============================================================================
#  ArgOS - Desktop Shortcut Manager
# =============================================================================

$DESKTOP      = [Environment]::GetFolderPath("Desktop")
$WORKSPACE    = "C:\Users\Nahuel\.gemini\antigravity\scratch\widget-ia-toy"
$ARGOS_EXE    = "$WORKSPACE\dist\win-unpacked\Argos.exe"
$LAUNCHER_CMD = "$WORKSPACE\ArgOS Launcher.cmd"
$ICON_ICO     = "$WORKSPACE\resources\icon.ico"
$ICON_SOURCE  = if (Test-Path $ICON_ICO) { $ICON_ICO } else { $ARGOS_EXE }

function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [ERROR] $msg" -ForegroundColor Red }

$Shell = New-Object -ComObject WScript.Shell

# FASE 1: Limpiar obsoletos
$OBSOLETE = @("AGRAx Hub.lnk","ArgOS Core.lnk","ArgOS Launcher.lnk","Argos.lnk","Antigravity.lnk")
foreach ($lnk in $OBSOLETE) {
    $path = Join-Path $DESKTOP $lnk
    if (Test-Path $path) { Remove-Item $path -Force; Write-Ok "Eliminado: $lnk" }
    else { Write-Warn "No encontrado (omitido): $lnk" }
}

# FASE 2: Validar
$ok = $true
if (-not (Test-Path $ARGOS_EXE))    { Write-Err "Argos.exe no encontrado"; $ok = $false }
if (-not (Test-Path $LAUNCHER_CMD)) { Write-Err "ArgOS Launcher.cmd no encontrado"; $ok = $false }
if (-not $ok) { Read-Host "Corregi los errores y volve a ejecutar"; exit 1 }

# FASE 3: Crear accesos directos
$lnk1 = $Shell.CreateShortcut("$DESKTOP\Argos.lnk")
$lnk1.TargetPath = $ARGOS_EXE
$lnk1.WorkingDirectory = "$WORKSPACE\dist\win-unpacked"
$lnk1.IconLocation = "$ICON_SOURCE,0"
$lnk1.Description = "ArgOS Hub - Cliente de escritorio Electron"
$lnk1.Save()
Write-Ok "Creado: Argos.lnk"

$lnk2 = $Shell.CreateShortcut("$DESKTOP\ArgOS Launcher.lnk")
$lnk2.TargetPath = $LAUNCHER_CMD
$lnk2.WorkingDirectory = $WORKSPACE
$lnk2.IconLocation = "$ICON_SOURCE,0"
$lnk2.Description = "ArgOS Launcher - Menu selector interactivo"
$lnk2.Save()
Write-Ok "Creado: ArgOS Launcher.lnk"

Write-Host ""
Write-Host "  Setup completado. Podes probar desde el Escritorio." -ForegroundColor Green
Read-Host "  Presiona Enter para salir"
