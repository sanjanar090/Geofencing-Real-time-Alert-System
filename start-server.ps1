
$listenerIds = @(
    Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
)

foreach ($processId in $listenerIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue

    if ($process -and $process.ProcessName -eq "geofencing-real-time-alert-system") {
        Stop-Process -Id $processId -Force
        Write-Host "Stopped previous Go server."
    }
    elseif ($process) {
        Write-Host "Port 8080 is being used by another application: $($process.ProcessName)"
        exit
    }
}

