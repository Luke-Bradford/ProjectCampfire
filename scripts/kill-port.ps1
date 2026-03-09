$port = 3000

# Kill any process holding port 3000
$connections = netstat -ano | Select-String ":$port\s"
$pids = $connections | ForEach-Object {
    ($_ -split '\s+')[-1]
} | Sort-Object -Unique | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' }

if ($pids) {
    foreach ($p in $pids) {
        Write-Host "Killing PID $p on port $port"
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

# Also kill any orphaned node processes from previous sessions
# (Next.js spawns multiple node workers that survive terminal closure)
$orphans = Get-Process node -ErrorAction SilentlyContinue
if ($orphans) {
    Write-Host "Killing $($orphans.Count) orphaned node process(es)"
    $orphans | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

Write-Host "Port $port clear"
