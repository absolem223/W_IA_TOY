$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$vendorRoot = Join-Path $root "vendor\whisper"
$binDir = Join-Path $vendorRoot "bin"
$modelDir = Join-Path $vendorRoot "models"
$tmpDir = Join-Path $root ".tmp\whisper-setup"

$modelName = if ($env:WHISPER_MODEL_FILE) { $env:WHISPER_MODEL_FILE } else { "ggml-base.bin" }
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}?download=true"
$releaseApi = "https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest"

New-Item -ItemType Directory -Force -Path $binDir, $modelDir, $tmpDir | Out-Null

function Download-File($Url, $OutFile) {
  Write-Host "Downloading $Url"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

function Find-WhisperAsset($Release) {
  $assets = @($Release.assets)
  $preferred = $assets | Where-Object {
    $_.name -match '\.zip$' -and
    $_.name -match '(win|windows|bin)' -and
    $_.name -match '(x64|amd64)'
  } | Select-Object -First 1

  if ($preferred) { return $preferred }

  return $assets | Where-Object {
    $_.name -match '\.zip$' -and $_.name -match '(win|windows)'
  } | Select-Object -First 1
}

$cliPath = Join-Path $binDir "whisper-cli.exe"
if (-not (Test-Path $cliPath)) {
  Write-Host "Resolving latest whisper.cpp Windows release..."
  $release = Invoke-RestMethod -Uri $releaseApi -Headers @{ "User-Agent" = "widget-ia-toy-setup" }
  $asset = Find-WhisperAsset $release

  if (-not $asset) {
    throw "No Windows x64 whisper.cpp ZIP asset found in latest release. Download whisper-cli.exe manually into $binDir."
  }

  $zipPath = Join-Path $tmpDir $asset.name
  $extractDir = Join-Path $tmpDir "extract"
  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null

  Download-File $asset.browser_download_url $zipPath
  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

  $cli = Get-ChildItem -Path $extractDir -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
  if (-not $cli) {
    $cli = Get-ChildItem -Path $extractDir -Recurse -Filter "main.exe" | Select-Object -First 1
  }
  if (-not $cli) {
    throw "Downloaded whisper.cpp asset did not contain whisper-cli.exe or main.exe."
  }

  Copy-Item -LiteralPath $cli.FullName -Destination $cliPath -Force

  Get-ChildItem -Path $cli.DirectoryName -File -Filter "*.dll" | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $binDir $_.Name) -Force
  }

  Write-Host "Installed whisper CLI: $cliPath"
} else {
  Write-Host "whisper-cli.exe already installed."
}

$modelPath = Join-Path $modelDir $modelName
if (-not (Test-Path $modelPath)) {
  Download-File $modelUrl $modelPath
  Write-Host "Installed Whisper model: $modelPath"
} else {
  Write-Host "Whisper model already installed: $modelPath"
}

Write-Host "Whisper offline setup complete."
