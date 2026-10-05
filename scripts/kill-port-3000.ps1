$connections = @()
try {
  $connections = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
} catch {
  $connections = @()
}

if (-not $connections) {
  $pids = netstat -ano |
    Select-String ':3000\s' |
    ForEach-Object {
      if ($_ -match '\s(\d+)\s*$') { [int]$Matches[1] }
    } |
    Sort-Object -Unique
} else {
  $pids = $connections.OwningProcess | Sort-Object -Unique
}

if (-not $pids) {
  Write-Host 'No processes listening on port 3000.'
  exit 0
}

foreach ($procId in $pids) {
  if ($procId -le 4) { continue }
  try {
    $proc = Get-Process -Id $procId -ErrorAction Stop
    Write-Host "Stopping PID $procId ($($proc.ProcessName))..."
    Stop-Process -Id $procId -Force -ErrorAction Stop
  } catch {
    Write-Warning "Could not stop PID ${procId}: $($_.Exception.Message)"
  }
}

Write-Host 'Done.'
