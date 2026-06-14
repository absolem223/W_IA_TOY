# =============================================================================
# create-shortcut.ps1
# Crea un acceso directo (.lnk) en el Escritorio del usuario que lanza
# Argos con `pnpm start` desde la raiz del proyecto.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/create-shortcut.ps1
#
# Tambien disponible como:
#   pnpm run shortcut
# =============================================================================

# Detectar la raiz del proyecto dinamicamente (un nivel arriba de scripts/)
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path

# Icono: usar resources/icon.ico si existe; de lo contrario, usa el icono
# por defecto de Electron. Reemplaza este archivo con tu .ico personalizado.
$IconPath = Join-Path $ProjectRoot "resources\icon.ico"
if (-not (Test-Path $IconPath)) {
    # Fallback: icono por defecto de Electron dentro de node_modules
    $IconPath = Join-Path $ProjectRoot "node_modules\electron\dist\electron.exe"
    Write-Host "[WARN] resources\icon.ico no encontrado. Usando icono de Electron por defecto."
    Write-Host "       Para personalizar, coloca tu archivo en: $ProjectRoot\resources\icon.ico"
}

$ShortcutPath = "$env:USERPROFILE\Desktop\Argos.lnk"

$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)

$Shortcut.TargetPath      = "cmd.exe"
$Shortcut.Arguments       = "/c `"cd /d `"`"$ProjectRoot`"`" && pnpm start`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.IconLocation    = "$IconPath,0"
$Shortcut.WindowStyle     = 7   # 7 = minimizado (oculta la ventana de cmd)
$Shortcut.Description     = "Argos - Widget IA local"

$Shortcut.Save()

Write-Host ""
Write-Host "[OK] Acceso directo creado en el Escritorio: $ShortcutPath"
Write-Host "   Apunta a: $ProjectRoot"
Write-Host ""
Write-Host "Para regenerar el shortcut si cambia la ruta del proyecto:"
Write-Host "   pnpm run shortcut"
Write-Host "   -- o --"
Write-Host "   powershell -ExecutionPolicy Bypass -File scripts/create-shortcut.ps1"
