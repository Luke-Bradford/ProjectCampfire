# dev-start.ps1
# Starts the full ProjectCampfire dev stack:
#   1. Kill orphaned node processes
#   2. Start Docker backing services (postgres, redis, minio, mailhog)
#   3. Start Next.js dev server (detached process, survives this script)
#   4. Start BullMQ worker (detached process, survives this script)
#   5. Wait until localhost:3000 responds

param(
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent

function Write-Step($msg) { Write-Host "==> $msg" }
function Write-OK($msg)   { Write-Host "[OK] $msg" }
function Write-Fail($msg) { Write-Host "[FAIL] $msg"; exit 1 }

# 1. Kill orphaned node processes
Write-Step "Killing orphaned node processes..."
$nodes = Get-Process node -ErrorAction SilentlyContinue
if ($nodes) {
    $nodes | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 1
    Write-OK "Killed $($nodes.Count) node process(es)"
} else {
    Write-OK "No orphaned node processes"
}

# 2. Start Docker services
Write-Step "Starting Docker services..."
Set-Location $root
docker compose up -d 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up failed" }
Write-OK "Docker services up"

# 3. Wait for postgres to be healthy
Write-Step "Waiting for postgres healthcheck..."
$attempts = 0
do {
    Start-Sleep 2
    $attempts++
    $health = docker inspect --format='{{.State.Health.Status}}' $(docker compose ps -q postgres) 2>$null
} while ($health -ne 'healthy' -and $attempts -lt 20)
if ($health -ne 'healthy') { Write-Fail "Postgres did not become healthy in time" }
Write-OK "Postgres healthy"

# 4. Run database migrations
Write-Step "Running database migrations..."
Set-Location $root
pnpm db:migrate 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Fail "db:migrate failed" }
Write-OK "Migrations applied"

# 5. Start Next.js dev server as a detached process with its own window
Write-Step "Starting Next.js dev server..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; pnpm dev" -WindowStyle Minimized
Write-OK "Next.js started"

# 5. Start BullMQ worker as a detached process with its own window
Write-Step "Starting BullMQ worker..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; pnpm worker" -WindowStyle Minimized
Write-OK "Worker started"

# 6. Wait for localhost:3000 to respond
Write-Step "Waiting for localhost:3000 (up to ${TimeoutSeconds}s)..."
$elapsed = 0
$ready = $false
while ($elapsed -lt $TimeoutSeconds) {
    Start-Sleep 3
    $elapsed += 3
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 5
        Write-OK "localhost:3000 responded HTTP $($r.StatusCode)"
        $ready = $true
        break
    } catch {}
}

if (-not $ready) {
    Write-Fail "localhost:3000 did not respond within ${TimeoutSeconds}s"
}

Write-Host ""
Write-Host "Dev stack is ready."
Write-Host "  App:    http://localhost:3000"
Write-Host "  MinIO:  http://localhost:9001"
Write-Host "  Mail:   http://localhost:8025"
