for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep 5
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 5
        Write-Host "HTTP $($r.StatusCode)"
        exit 0
    } catch {}
}
Write-Host "TIMEOUT"
exit 1
