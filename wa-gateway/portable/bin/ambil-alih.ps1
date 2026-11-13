# Menghentikan gateway WhatsApp lain di laptop ini supaya IRIS Gateway dari folder ini bisa langsung jalan:
#  - gateway lama: start.bat + "node gateway.mjs" (jendela hitam)
#  - IRIS Gateway dari folder lain (pelari jalankan.bat + node)
# Gateway dari folder ini sendiri tidak disentuh. Dua gateway dengan tautan WhatsApp yang sama saling menendang,
# jadi yang lama harus berhenti.
$ErrorActionPreference = 'SilentlyContinue'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\').ToLower()
$ini  = [IO.Path]::GetFullPath((Join-Path $root 'app\gateway.mjs')).ToLower()
function Full($p) { try { return [IO.Path]::GetFullPath($p).ToLower() } catch { return '' } }
function Waktu { (Get-Date).ToString('dd/MM/yyyy, HH.mm.ss') }
$semua = @(Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name='node.exe'")
$bunuh = @{}
foreach ($p in $semua) {
  $cl = [string]$p.CommandLine
  if ($p.ProcessId -eq $PID -or -not $cl) { continue }
  if ($p.Name -eq 'node.exe' -and $cl -match 'gateway\.mjs') {
    $m = [regex]::Match($cl, '"([^"]*gateway\.mjs)"|(\S*gateway\.mjs)')
    $g = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value }
    if ($g -match '^[A-Za-z]:\\') {
      if ((Full $g) -eq $ini) { continue }
      if (-not (Test-Path (Join-Path (Split-Path $g) 'xlsx-mini.mjs'))) { continue }   # bukan gateway Portal Waspang
    }
    $bunuh[$p.ProcessId] = 'gateway lama (node)'
    $par = $semua | Where-Object { $_.ProcessId -eq $p.ParentProcessId -and $_.Name -eq 'cmd.exe' }
    if ($par -and ([string]$par.CommandLine) -notmatch [regex]::Escape($root)) { $bunuh[$par.ProcessId] = 'jendela gateway lama' }
  }
  elseif ($p.Name -eq 'cmd.exe') {
    $m = [regex]::Match($cl, '([A-Za-z]:\\[^"]*?)\\start\.bat', 'IgnoreCase')
    if ($m.Success -and (Test-Path (Join-Path $m.Groups[1].Value 'gateway.mjs'))) { $bunuh[$p.ProcessId] = 'start.bat lama'; continue }
    $m = [regex]::Match($cl, '([A-Za-z]:\\[^"]*?)\\bin\\jalankan\.bat', 'IgnoreCase')
    if ($m.Success) {
      $r2 = (Full (Join-Path $m.Groups[1].Value '.')).TrimEnd('\')
      if ($r2 -ne $root -and (Test-Path (Join-Path $m.Groups[1].Value 'app\gateway.mjs'))) { $bunuh[$p.ProcessId] = 'IRIS Gateway folder lain' }
    }
  }
}
foreach ($id in $bunuh.Keys) {
  & taskkill.exe /PID $id /T /F *> $null
  Write-Output ("{0} - Dihentikan otomatis: {1} (PID {2})" -f (Waktu), $bunuh[$id], $id)
}
if ($bunuh.Count) { Start-Sleep -Seconds 2 }
