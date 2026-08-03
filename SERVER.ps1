param(
  [string]$Root = (Join-Path $PSScriptRoot "dist"),
  [int]$Port = 5173,
  [switch]$Lan,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$rootPath = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
$rootPrefix = $rootPath + [IO.Path]::DirectorySeparatorChar
$indexPath = Join-Path $rootPath "index.html"

if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
  throw "Game data was not found: $indexPath"
}

$listenAddress = [Net.IPAddress]::Loopback
if ($Lan) {
  $listenAddress = [Net.IPAddress]::Any
}

$listener = $null
$selectedPort = $null
for ($candidatePort = $Port; $candidatePort -lt ($Port + 10); $candidatePort += 1) {
  try {
    $candidate = [Net.Sockets.TcpListener]::new($listenAddress, $candidatePort)
    $candidate.Start()
    $listener = $candidate
    $selectedPort = $candidatePort
    break
  }
  catch {
    if ($null -ne $candidate) {
      $candidate.Stop()
    }
  }
}

if ($null -eq $listener -or $null -eq $selectedPort) {
  throw "No available port was found between $Port and $($Port + 9)."
}

function Get-ContentType([string]$Path) {
  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".webmanifest" { return "application/manifest+json; charset=utf-8" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".svg" { return "image/svg+xml" }
    ".ico" { return "image/x-icon" }
    ".mp3" { return "audio/mpeg" }
    ".wav" { return "audio/wav" }
    ".ogg" { return "audio/ogg" }
    ".m4a" { return "audio/mp4" }
    default { return "application/octet-stream" }
  }
}

function Write-SimpleResponse(
  [IO.Stream]$Stream,
  [int]$StatusCode,
  [string]$StatusText,
  [string]$Message
) {
  $body = [Text.Encoding]::UTF8.GetBytes($Message)
  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($body, 0, $body.Length)
}

$localUrl = "http://127.0.0.1:$selectedPort/"
$host.UI.RawUI.WindowTitle = "TETORISU Server - Close this window to stop"
Write-Host ""
Write-Host "  TETORISU is now showing" -ForegroundColor Yellow
Write-Host "  $localUrl" -ForegroundColor Cyan

if ($Lan) {
  Write-Host ""
  Write-Host "  Open one of these addresses on a phone connected to the same Wi-Fi:" -ForegroundColor Yellow
  [Net.Dns]::GetHostAddresses([Net.Dns]::GetHostName()) |
    Where-Object {
      $_.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and
      -not [Net.IPAddress]::IsLoopback($_)
    } |
    ForEach-Object { Write-Host "  http://$($_.IPAddressToString):$selectedPort/" -ForegroundColor Cyan }
}

Write-Host ""
Write-Host "  Close this window to stop the game server."
Write-Host ""

if (-not $NoBrowser) {
  Start-Process $localUrl
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $reader = $null
    try {
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new(
        $stream,
        [Text.Encoding]::ASCII,
        $false,
        1024,
        $true
      )
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        continue
      }

      $headers = @{}
      while ($true) {
        $headerLine = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($headerLine)) {
          break
        }
        $separator = $headerLine.IndexOf(":")
        if ($separator -gt 0) {
          $name = $headerLine.Substring(0, $separator).Trim().ToLowerInvariant()
          $headers[$name] = $headerLine.Substring($separator + 1).Trim()
        }
      }

      $requestParts = $requestLine.Split(" ")
      if ($requestParts.Length -lt 2) {
        Write-SimpleResponse $stream 400 "Bad Request" "Bad request"
        continue
      }

      $method = $requestParts[0].ToUpperInvariant()
      if ($method -ne "GET" -and $method -ne "HEAD") {
        Write-SimpleResponse $stream 405 "Method Not Allowed" "Method not allowed"
        continue
      }

      $requestUri = [Uri]("http://localhost" + $requestParts[1])
      $relativePath = [Uri]::UnescapeDataString($requestUri.AbsolutePath).TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = "index.html"
      }
      $relativePath = $relativePath.Replace("/", [IO.Path]::DirectorySeparatorChar)
      $filePath = [IO.Path]::GetFullPath((Join-Path $rootPath $relativePath))

      if (-not $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        Write-SimpleResponse $stream 403 "Forbidden" "Forbidden"
        continue
      }
      if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        Write-SimpleResponse $stream 404 "Not Found" "Not found"
        continue
      }

      $bytes = [IO.File]::ReadAllBytes($filePath)
      $start = 0L
      $end = [long]$bytes.Length - 1
      $statusCode = 200
      $statusText = "OK"

      $rangeHeader = $headers["range"]
      if ($null -ne $rangeHeader -and $rangeHeader -match "^bytes=(\d*)-(\d*)$") {
        if ($matches[1] -eq "" -and $matches[2] -ne "") {
          $start = [Math]::Max(0, $bytes.Length - [long]$matches[2])
          $end = $bytes.Length - 1
        }
        else {
          if ($matches[1] -ne "") {
            $start = [long]$matches[1]
          }
          if ($matches[2] -ne "") {
            $end = [long]$matches[2]
          }
        }

        if ($start -lt 0 -or $end -lt $start -or $start -ge $bytes.Length) {
          $header = "HTTP/1.1 416 Range Not Satisfiable`r`nContent-Range: bytes */$($bytes.Length)`r`nConnection: close`r`n`r`n"
          $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
          $stream.Write($headerBytes, 0, $headerBytes.Length)
          continue
        }

        $end = [Math]::Min($end, $bytes.Length - 1)
        $statusCode = 206
        $statusText = "Partial Content"
      }

      $contentLength = $end - $start + 1
      $responseHeader = "HTTP/1.1 $statusCode $statusText`r`n"
      $responseHeader += "Content-Type: $(Get-ContentType $filePath)`r`n"
      $responseHeader += "Content-Length: $contentLength`r`n"
      $responseHeader += "Accept-Ranges: bytes`r`n"
      if ($statusCode -eq 206) {
        $responseHeader += "Content-Range: bytes $start-$end/$($bytes.Length)`r`n"
      }
      $responseHeader += "Cache-Control: no-cache`r`nConnection: close`r`n`r`n"
      $responseHeaderBytes = [Text.Encoding]::ASCII.GetBytes($responseHeader)
      $stream.Write($responseHeaderBytes, 0, $responseHeaderBytes.Length)
      if ($method -eq "GET") {
        $stream.Write($bytes, [int]$start, [int]$contentLength)
      }
    }
    catch {
      # Browser cancellations and incomplete requests are safe to ignore.
    }
    finally {
      if ($null -ne $reader) {
        $reader.Dispose()
      }
      $client.Dispose()
    }
  }
}
finally {
  $listener.Stop()
}
