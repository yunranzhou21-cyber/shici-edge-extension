param([string]$Source = (Join-Path $PSScriptRoot '..\extension\assets\brand-source.jpg'))
# Encode the supplied artwork at Edge's required square sizes without altering it.
Add-Type -AssemblyName System.Drawing
$iconFolder = Join-Path $PSScriptRoot '..\extension\assets'
$original = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
try {
  foreach ($iconSize in @(16,32,48,128,256,512)) {
    $bitmap = New-Object System.Drawing.Bitmap($iconSize, $iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($original, 0, 0, $iconSize, $iconSize)
      $bitmap.Save((Join-Path $iconFolder "icon-$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $original.Dispose() }
