$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$distDir = Join-Path $projectRoot "dist"
$zipPath = Join-Path $projectRoot "dist.zip"

if (-not (Test-Path $distDir)) {
  throw "dist folder not found. Run npm run build first."
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $distDir "*") -DestinationPath $zipPath -Force
Write-Host "Created $zipPath"
