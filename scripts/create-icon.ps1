Add-Type -AssemblyName System.Drawing

$pngPath = (Resolve-Path "resources\icon.png").Path
$icoPath = Join-Path (Get-Location) "resources\icon.ico"
$sizes   = @(16, 24, 32, 48, 64, 128, 256)

Write-Host "Source PNG: $pngPath"

# ---- build raw ICO bytes manually (supports multiple resolutions) ----
$original = [System.Drawing.Image]::FromFile($pngPath)

$imageStreams = @()

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.DrawImage($original, 0, 0, $size, $size)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $imageStreams += $ms
    $bmp.Dispose()
}
$original.Dispose()

# ICO header: RESERVED(2) TYPE=1(2) COUNT(2)
$count  = $sizes.Count
$header = [byte[]](0,0, 1,0, $count,0)

# Each directory entry = 16 bytes
$dirSize    = $count * 16
$dataOffset = $header.Length + $dirSize

$dirEntries = New-Object System.Collections.Generic.List[byte[]]
$dataBlobs  = New-Object System.Collections.Generic.List[byte[]]
$currentOffset = $dataOffset

for ($i = 0; $i -lt $count; $i++) {
    $size = $sizes[$i]
    $data = $imageStreams[$i].ToArray()
    $len  = $data.Length

    # Directory entry
    $w    = if ($size -ge 256) { 0 } else { [byte]$size }
    $h    = if ($size -ge 256) { 0 } else { [byte]$size }
    $entry = [byte[]]@(
        $w, $h,       # width, height (0 = 256+)
        0, 0,         # colorCount, reserved
        1, 0,         # planes
        32, 0,        # bit count
        ($len -band 0xFF), (($len -shr 8) -band 0xFF), (($len -shr 16) -band 0xFF), (($len -shr 24) -band 0xFF),  # size
        ($currentOffset -band 0xFF), (($currentOffset -shr 8) -band 0xFF), (($currentOffset -shr 16) -band 0xFF), (($currentOffset -shr 24) -band 0xFF)   # offset
    )
    $dirEntries.Add($entry)
    $dataBlobs.Add($data)
    $currentOffset += $len
}

# Write ICO file
$fs = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$fs.Write($header, 0, $header.Length)
foreach ($entry in $dirEntries) { $fs.Write($entry, 0, $entry.Length) }
foreach ($blob  in $dataBlobs)  { $fs.Write($blob,  0, $blob.Length)  }
$fs.Close()

foreach ($ms in $imageStreams) { $ms.Dispose() }

Write-Host "ICO created: $icoPath ($count resolutions: $($sizes -join ', ')px)"
