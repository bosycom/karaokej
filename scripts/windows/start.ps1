#Requires -Version 5.1
<#
.SYNOPSIS
  Start Karaokej in production mode (API + built UI on port 3000).
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
Set-Location $Root

$envFile = Join-Path $Root '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Missing .env. Run .\setup.ps1 first."
}

$mainJs = Join-Path $Root 'apps\api\dist\main.js'
if (-not (Test-Path -LiteralPath $mainJs)) {
  throw "Missing $mainJs. Re-pack with npm run pack:windows."
}

$nodeExe = Join-Path $Root 'node\node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) {
  $fromPath = Get-Command node -ErrorAction SilentlyContinue
  if (-not $fromPath) {
    throw "Node.js was not found. Run .\setup.ps1 first."
  }
  $nodeExe = $fromPath.Source
}

Write-Host "Starting Karaokej from $Root"
Write-Host "Open http://localhost:3000  (other devices: http://<this-pc-lan-ip>:3000)"
& $nodeExe $mainJs
