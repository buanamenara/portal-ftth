# Pasang otomatis IRIS Gateway untuk akun Windows ini (tanpa hak admin):
#  - "IRIS Gateway"        : menyala di balik layar 20 dtk setelah login (juga setelah laptop restart), tanpa panel
#  - "IRIS Gateway (jaga)" : 15 dtk setelah bangun dari sleep, dan tiap 15 menit, memastikan gateway menyala (tanpa panel)
#  - shortcut "IRIS Gateway" di Desktop: membuka panel ("/panel")
# Shortcut lama start.bat (gateway versi lama) di folder Startup dibuang supaya tidak ada dua gateway.
param([switch]$Uji)   # -Uji: hanya menulis XML jadwal ke folder data untuk diperiksa, tanpa memasang apa pun
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vbs  = Join-Path $root 'IRIS Gateway.vbs'
$ico  = Join-Path $root 'app\assets\iris.ico'
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
function X([string]$s) { [System.Security.SecurityElement]::Escape($s) }
function TaskXml([string]$desc, [string]$triggers, [string]$args) {
@"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>$(X $desc)</Description></RegistrationInfo>
  <Triggers>$triggers</Triggers>
  <Principals><Principal id="Author"><UserId>$(X $user)</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author"><Exec><Command>wscript.exe</Command><Arguments>$(X ('"' + $vbs + '"' + $args))</Arguments><WorkingDirectory>$(X $root)</WorkingDirectory></Exec></Actions>
</Task>
"@
}
$logon  = "<LogonTrigger><Enabled>true</Enabled><UserId>$(X $user)</UserId><Delay>PT20S</Delay></LogonTrigger>"
$resume = "<EventTrigger><Enabled>true</Enabled><Delay>PT15S</Delay><Subscription>" + (X "<QueryList><Query Id=`"0`" Path=`"System`"><Select Path=`"System`">*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]</Select></Query></QueryList>") + "</Subscription></EventTrigger>"
$every  = "<TimeTrigger><Enabled>true</Enabled><StartBoundary>2026-01-01T00:00:00</StartBoundary><Repetition><Interval>PT15M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition></TimeTrigger>"

$xUtama = TaskXml 'IRIS Gateway: menyala di balik layar setelah login.' $logon ''
$xJaga  = TaskXml 'IRIS Gateway: memastikan gateway menyala setelah bangun dari sleep dan tiap 15 menit.' ($resume + $every) ' /diam'
if ($Uji) {
  foreach ($p in @(@('uji_jadwal_utama.xml', $xUtama), @('uji_jadwal_jaga.xml', $xJaga))) {
    $null = [xml]$p[1]
    $svc = New-Object -ComObject Schedule.Service; $svc.Connect(); $def = $svc.NewTask(0); $def.XmlText = $p[1]   # diperiksa Windows, tidak didaftarkan
    Set-Content -Path (Join-Path $root ('data\' + $p[0])) -Value $p[1] -Encoding Unicode; Write-Host "XML diterima Task Scheduler: $($p[0]) (pemicu: $($def.Triggers.Count))"
  }
  return
}
Write-Host 'Memasang jadwal Windows...'
Register-ScheduledTask -TaskName 'IRIS Gateway' -Xml $xUtama -Force | Out-Null
Register-ScheduledTask -TaskName 'IRIS Gateway (jaga)' -Xml $xJaga -Force | Out-Null

$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'IRIS Gateway.lnk'))
$lnk.TargetPath = 'wscript.exe'; $lnk.Arguments = '"' + $vbs + '" /panel'; $lnk.WorkingDirectory = $root
$lnk.IconLocation = $ico; $lnk.Description = 'IRIS Gateway (WhatsApp Portal Waspang)'; $lnk.Save()

$startup = [Environment]::GetFolderPath('Startup')
Get-ChildItem $startup -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
  $t = $sh.CreateShortcut($_.FullName).TargetPath
  if ($t -match 'start\.bat$' -and (Test-Path (Join-Path (Split-Path $t) 'gateway.mjs'))) { Remove-Item $_.FullName -Force; Write-Host "Shortcut gateway lama dibuang dari Startup: $($_.Name)" }
}
Write-Host 'Gateway lama yang masih berjalan di laptop ini (start.bat) dihentikan otomatis saat IRIS Gateway mulai.'

Write-Host ''
Write-Host 'Selesai. IRIS Gateway menyala sendiri di balik layar saat laptop menyala/login dan setelah bangun dari sleep.' -ForegroundColor Green
Write-Host 'Panel hanya terbuka dari shortcut "IRIS Gateway" di Desktop.'
Start-Process wscript.exe -ArgumentList ('"' + $vbs + '" /panel')
