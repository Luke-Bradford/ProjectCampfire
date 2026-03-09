$port = 3000
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
} else {
    Write-Host "Port $port is clear"
}
Write-Host "Port $port clear"
