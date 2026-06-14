# =============================================================================
#  ArgOS - Interactive Launcher Selector
#  Workspace: C:\Users\Nahuel\.gemini\antigravity\scratch\widget-ia-toy
#  Version: 3.0 | Runtime: PowerShell 5.1+
# =============================================================================

$Host.UI.RawUI.WindowTitle = "ArgOS Launcher"

function c($code, $text) {
    $esc = [char]27
    return "${esc}[${code}m${text}${esc}[0m"
}

$CYAN    = "36"
$YELLOW  = "33"
$GREEN   = "32"
$RED     = "31"
$WHITE   = "97"
$GRAY    = "90"
$BOLD    = "1"

$WORKSPACE     = "C:\Users\Nahuel\.gemini\antigravity\scratch\widget-ia-toy"
$ARGOS_EXE     = "$WORKSPACE\dist\win-unpacked\Argos.exe"
$NEXT_ROOT     = "E:\Argos 3.0\packages\dashboard"
$DASHBOARD_URL = "http://localhost:3100"
$CORE_PORT     = 3100

# Detect preferred model and next root from .env or .env.example
$PreferredModel = "google/gemma-4-e4b" # default fallback
$EnvPath = "$WORKSPACE\.env"
if (Test-Path $EnvPath) {
    $EnvModel = Get-Content $EnvPath | Where-Object { $_ -match "^LMSTUDIO_PREFERRED_MODEL=(.+)" } | ForEach-Object { $Matches[1].Trim() }
    if ($EnvModel) { $PreferredModel = $EnvModel }
    $EnvNext = Get-Content $EnvPath | Where-Object { $_ -match "^NEXT_ROOT=(.+)" } | ForEach-Object { $Matches[1].Trim() }
    if ($EnvNext) { $NEXT_ROOT = $EnvNext }
} else {
    $EnvExamplePath = "$WORKSPACE\.env.example"
    if (Test-Path $EnvExamplePath) {
        $EnvModel = Get-Content $EnvExamplePath | Where-Object { $_ -match "^LMSTUDIO_PREFERRED_MODEL=(.+)" } | ForEach-Object { $Matches[1].Trim() }
        if ($EnvModel) { $PreferredModel = $EnvModel }
        $EnvNext = Get-Content $EnvExamplePath | Where-Object { $_ -match "^NEXT_ROOT=(.+)" } | ForEach-Object { $Matches[1].Trim() }
        if ($EnvNext) { $NEXT_ROOT = $EnvNext }
    }
}

function Show-Banner {
    Clear-Host
    Write-Host ""
    Write-Host (c $CYAN "  [ Argos Platform ]")
    Write-Host (c $GRAY "  Runtime Launcher v3.0")
    Write-Host (c $GRAY "  workspace: $WORKSPACE")
    Write-Host ""
    Write-Host (c $GRAY "  -------------------------------------------------")
    Write-Host ""
}

function Get-ServiceStatus {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

function Get-HttpStatus {
    param([string]$Url)
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch { return $false }
}

function Get-ProcessStatus {
    param([string]$ExePath)
    $name = [System.IO.Path]::GetFileNameWithoutExtension($ExePath)
    return ($null -ne (Get-Process -Name $name -ErrorAction SilentlyContinue))
}

function Get-ModelStatus {
    param([string]$ModelName)
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:1234/v1/models" -TimeoutSec 1 -ErrorAction Stop
        $loadedModels = $r.data.id
        return ($loadedModels -contains $ModelName)
    } catch { return $false }
}

function Show-BackgroundServicesStatus {
    $corePort = Get-ServiceStatus -Port $CORE_PORT
    $lmsPort  = Get-ServiceStatus -Port 1234
    $modelLoaded = Get-ModelStatus -ModelName $PreferredModel

    $allReady = $corePort -and $lmsPort -and $modelLoaded

    if ($allReady) {
        Write-Host (c $GREEN "  [Servicios listos y corriendo]")
        Write-Host "  Core Next.js: " (c $GREEN "✅ listo (puerto $CORE_PORT)")
        Write-Host "  LMStudio:     " (c $GREEN "✅ listo (puerto 1234)")
        Write-Host "  Modelo:       " (c $GREEN "✅ $PreferredModel cargado")
    } else {
        Write-Host (c $YELLOW "  [Iniciando servicios en background...]")
        
        $coreText = if ($corePort) { c $GREEN "✅ listo (puerto $CORE_PORT)" } else { c $YELLOW "⏳ iniciando..." }
        $lmsText  = if ($lmsPort)  { c $GREEN "✅ listo (puerto 1234)" } else { c $YELLOW "⏳ iniciando..." }
        $modelText = if ($modelLoaded) { c $GREEN "✅ $PreferredModel cargado" } else { c $YELLOW "⏳ cargando $PreferredModel..." }

        Write-Host "  Core Next.js: $coreText"
        Write-Host "  LMStudio:     $lmsText"
        Write-Host "  Modelo:       $modelText"
    }
    Write-Host ""
}

function Show-Status {
    $corePort   = Get-ServiceStatus -Port $CORE_PORT
    $coreHttp   = Get-HttpStatus -Url $DASHBOARD_URL
    $electronUp = Get-ProcessStatus -ExePath $ARGOS_EXE
    $lmsPort    = Get-ServiceStatus -Port 1234
    $modelLoaded = Get-ModelStatus -ModelName $PreferredModel

    $portIcon = if ($corePort)   { c $GREEN "[ACTIVO]"    } else { c $RED "[INACTIVO]" }
    $httpIcon = if ($coreHttp)   { c $GREEN "[OK]"        } else { c $RED "[SIN RESP]" }
    $hubIcon  = if ($electronUp) { c $GREEN "[CORRIENDO]" } else { c $RED "[DETENIDO]" }
    $lmsIcon  = if ($lmsPort)    { c $GREEN "[ACTIVO]"    } else { c $RED "[INACTIVO]" }
    $modelIcon = if ($modelLoaded) { c $GREEN "[CARGADO]" } else { c $RED "[NO CARGADO]" }

    Write-Host ""
    Write-Host (c $BOLD "  ESTADO DETALLADO DEL RUNTIME")
    Write-Host (c $GRAY "  -------------------------------------------------")
    Write-Host "  ArgOS Core (Next.js - puerto $CORE_PORT):  $portIcon"
    Write-Host "  Dashboard ($DASHBOARD_URL):           $httpIcon"
    Write-Host "  Hub (Electron - Argos.exe):            $hubIcon"
    Write-Host "  LMStudio Server (puerto 1234):        $lmsIcon"
    Write-Host "  Modelo en memoria ($PreferredModel): $modelIcon"
    Write-Host ""
}

function Start-ArgosCore {
    if (-not (Get-ServiceStatus -Port $CORE_PORT)) {
        if (-not (Test-Path $NEXT_ROOT)) {
            Write-Host (c $RED "  [ERROR] Ruta no encontrada: $NEXT_ROOT")
        } else {
            Start-Process -FilePath "powershell.exe" `
                -ArgumentList "-Command", "cd '$NEXT_ROOT'; pnpm run start" `
                -WindowStyle Hidden
        }
    }
}

function Start-BackgroundServices {
    # Check and start Next.js Core
    Start-ArgosCore

    # Check and start LMStudio server
    if (-not (Get-ServiceStatus -Port 1234)) {
        Start-Process -FilePath "lms.exe" -ArgumentList "server start" -WindowStyle Hidden
    }

    # Background routine: wait for LMStudio server port, then load preferred model
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-Command", "while (-not (Get-NetTCPConnection -LocalPort 1234 -State Listen -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 1 }; lms load '$PreferredModel' --yes" `
        -WindowStyle Hidden
}

function Open-Dashboard {
    Write-Host ""
    Write-Host (c $YELLOW "  -> Abriendo Dashboard...")
    Start-ArgosCore
    Start-Sleep -Seconds 2
    $ready = $false
    for ($i = 1; $i -le 8; $i++) {
        if (Get-HttpStatus -Url $DASHBOARD_URL) { $ready = $true; break }
        Write-Host (c $GRAY "    Esperando servidor... ($i/8)")
        Start-Sleep -Seconds 2
    }
    if ($ready) {
        Start-Process $DASHBOARD_URL
        Write-Host (c $GREEN "  [OK] Dashboard abierto en $DASHBOARD_URL")
    } else {
        Write-Host (c $RED "  [ERROR] El servidor no respondio a tiempo. Abriendo de todas formas...")
        Start-Process $DASHBOARD_URL
    }
}

function Open-Hub {
    Write-Host ""
    Write-Host (c $YELLOW "  -> Iniciando Hub (Electron)...")
    if (-not (Test-Path $ARGOS_EXE)) {
        Write-Host (c $RED "  [ERROR] Ejecutable no encontrado: $ARGOS_EXE")
        Write-Host -NoNewline (c $YELLOW "  ¿Querés iniciar el Hub en modo desarrollo (pnpm run dev)? (S/N): ")
        $ans = Read-Host
        if ($ans -eq "s" -or $ans -eq "S" -or $ans -eq "") {
            Write-Host (c $GREEN "  Iniciando modo desarrollo...")
            Start-Process -FilePath "powershell.exe" -ArgumentList "-Command", "cd '$WORKSPACE'; pnpm run dev"
            return
        }
        Write-Host (c $GRAY "    Para empaquetar, ejecutá 'pnpm run build:local' desde el workspace.")
        return
    }
    if (Get-ProcessStatus -ExePath $ARGOS_EXE) {
        Write-Host (c $GREEN "  [OK] El Hub ya esta corriendo.")
    } else {
        Start-Process -FilePath $ARGOS_EXE
        Write-Host (c $GREEN "  [OK] Hub iniciado correctamente.")
    }
}

function Show-MenuOptions {
    Write-Host (c $BOLD "  OPCIONES")
    Write-Host (c $GRAY "  -------------------------------------------------")
    Write-Host (c $CYAN  "  [1]") " Abrir Dashboard      " (c $GRAY "(Core + navegador en localhost:$CORE_PORT)")
    Write-Host (c $CYAN  "  [2]") " Abrir Hub            " (c $GRAY "(Electron app Argos.exe)")
    Write-Host (c $CYAN  "  [3]") " Ver estado del runtime" (c $GRAY "(Muestra puertos y procesos en detalle)")
    Write-Host (c $RED   "  [4]") " Salir"
    Write-Host ""
}

function Get-MenuInput {
    try {
        $inputBuffer = ""
        Write-Host -NoNewline (c $WHITE "  Selecciona una opcion: ")
        
        $lastCore = $null
        $lastLms = $null
        $lastModel = $null

        while ($true) {
            $corePort = Get-ServiceStatus -Port $CORE_PORT
            $lmsPort  = Get-ServiceStatus -Port 1234
            $modelLoaded = Get-ModelStatus -ModelName $PreferredModel

            if ($corePort -ne $lastCore -or $lmsPort -ne $lastLms -or $modelLoaded -ne $lastModel) {
                $lastCore = $corePort
                $lastLms = $lmsPort
                $lastModel = $modelLoaded
                
                # Clear and redraw the interactive view
                Show-Banner
                Show-BackgroundServicesStatus
                Show-MenuOptions
                Write-Host -NoNewline (c $WHITE "  Selecciona una opcion: $inputBuffer")
            }

            if ([System.Console]::KeyAvailable) {
                $keyInfo = [System.Console]::ReadKey($true)
                $char = $keyInfo.KeyChar
                $key  = $keyInfo.Key

                if ($key -eq [System.ConsoleKey]::Enter) {
                    Write-Host ""
                    return $inputBuffer
                }
                elseif ($key -eq [System.ConsoleKey]::Backspace) {
                    if ($inputBuffer.Length -gt 0) {
                        $inputBuffer = $inputBuffer.Substring(0, $inputBuffer.Length - 1)
                        # Remove last char visually
                        [System.Console]::Write("`b `b")
                    }
                }
                else {
                    # Accept options 1 to 4
                    if ($char -match "[1-4]") {
                        $inputBuffer += $char
                        [System.Console]::Write($char)
                    }
                }
            }
            Start-Sleep -Milliseconds 200
        }
    } catch {
        # Fallback to standard blocking Read-Host if console API is not interactive
        Show-Banner
        Show-BackgroundServicesStatus
        Show-MenuOptions
        $choice = Read-Host (c $WHITE "  Selecciona una opcion")
        return $choice
    }
}

# Start autostart routine at startup
Start-BackgroundServices

# Main interactive loop
do {
    Show-Banner
    Show-BackgroundServicesStatus
    Show-MenuOptions
    
    $choice = Get-MenuInput
    switch ($choice.Trim()) {
        "1" { Open-Dashboard }
        "2" { Open-Hub       }
        "3" { Show-Status; Write-Host ""; Read-Host (c $GRAY "  Presiona Enter para volver") }
        "4" { Write-Host (c $GRAY "  Hasta luego.`n"); break }
        default { Write-Host (c $RED "  Opcion invalida.") }
    }
} while ($choice.Trim() -ne "4")
