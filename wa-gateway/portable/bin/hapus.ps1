# Melepas IRIS Gateway dari jadwal Windows, membuang shortcut Desktop, dan menghentikan gateway dari folder ini.
$root = Split-Path -Parent $PSScriptRoot
foreach ($n in 'IRIS Gateway', 'IRIS Gateway (jaga)') { Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue }
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'IRIS Gateway.lnk') -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match [regex]::Escape($root) -and $_.Name -match '^(cmd|node)\.exe$' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host 'IRIS Gateway dilepas dari jadwal Windows dan dihentikan. Folder data (tautan WA) tidak dihapus.' -ForegroundColor Green
