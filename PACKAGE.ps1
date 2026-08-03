$ErrorActionPreference = "Stop"

$releaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "release"))
$packageRoot = [IO.Path]::GetFullPath((Join-Path $releaseRoot "TETORISU"))
$zipPath = [IO.Path]::GetFullPath((Join-Path $releaseRoot "TETORISU-initial.zip"))
$expectedPrefix = $releaseRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

if (-not $packageRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Unsafe package target: $packageRoot"
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path -LiteralPath $packageRoot) {
  Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Path $packageRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "dist") -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "PLAY.bat") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "PLAY-LAN.bat") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "SERVER.ps1") -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "DISTRIBUTION.txt") -Destination (Join-Path $packageRoot "README.txt")

Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal
Write-Host "Created: $zipPath" -ForegroundColor Green
