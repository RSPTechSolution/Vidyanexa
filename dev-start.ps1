# Starts the whole Vidyanexa test setup on this computer and opens it in the browser.
#   Right-click > "Run with PowerShell", or run:  powershell -ExecutionPolicy Bypass -File dev-start.ps1
# Website: http://localhost:3000   Dashboard login: admin@demo.com / Demo@1234   API: http://localhost:8000/docs
# The API and the website each run in their own window; close a window to stop that server (or run dev-stop.ps1).

$ErrorActionPreference = "Continue"  # native tools (docker, npm) print to stderr; real failures are checked below
$root = $PSScriptRoot

function Wait-For($what, [scriptblock]$check, $seconds = 180) {
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) { if (& $check) { Write-Host "  $what is ready" -ForegroundColor Green; return } ; Start-Sleep -Seconds 3 }
  throw "$what did not start within $seconds seconds"
}
function Port-Busy($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

Write-Host "1/4 Docker" -ForegroundColor Cyan
cmd /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  Wait-For "Docker" { cmd /c "docker info >nul 2>&1"; $LASTEXITCODE -eq 0 }
} else { Write-Host "  Docker is already running" -ForegroundColor Green }

Write-Host "2/4 Database, Redis and file storage" -ForegroundColor Cyan
docker compose -f "$root\infra\compose\docker-compose.dev.yml" up -d postgres redis s3
Wait-For "Database" { (docker inspect -f "{{.State.Health.Status}}" eduvia_pg 2>$null) -eq "healthy" }

Write-Host "3/4 API (port 8000)" -ForegroundColor Cyan
if (Port-Busy 8000) { Write-Host "  Something is already running on port 8000; leaving it" -ForegroundColor Yellow }
else {
  Push-Location "$root\api"; & .\venv\Scripts\python.exe -m alembic upgrade head; Pop-Location
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='Vidyanexa API (port 8000)'; cd '$root\api'; .\venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1"
  Wait-For "API" { try { (Invoke-WebRequest "http://localhost:8000/docs" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { $false } }
}

Write-Host "4/4 Website (port 3000)" -ForegroundColor Cyan
if (Port-Busy 3000) { Write-Host "  Something is already running on port 3000; leaving it" -ForegroundColor Yellow }
else {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='Vidyanexa website (port 3000)'; cd '$root\web'; npm run dev"
  Wait-For "Website" { try { (Invoke-WebRequest "http://localhost:3000/" -UseBasicParsing -TimeoutSec 10).StatusCode -eq 200 } catch { $false } } 240
}

Write-Host ""
Write-Host "Ready: http://localhost:3000   (dashboard login: admin@demo.com / Demo@1234)" -ForegroundColor Green
Start-Process "http://localhost:3000"
