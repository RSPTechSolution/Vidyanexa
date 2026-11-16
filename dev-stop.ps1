# Stops the Vidyanexa test setup started by dev-start.ps1: the website, the API, and the database containers.
#   powershell -ExecutionPolicy Bypass -File dev-stop.ps1
# Your test data is kept (it lives in Docker volumes) and comes back next time.

$root = $PSScriptRoot
foreach ($port in 3000, 8000) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped the server on port $port"
  }
}
docker compose -f "$root\infra\compose\docker-compose.dev.yml" stop
Write-Host "Stopped. Run dev-start.ps1 to start again." -ForegroundColor Green
