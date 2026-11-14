# Pet iRIS: robot chibi yang melayang di desktop laptop IRIS Gateway (digambar kode, tanpa file gambar).
# Dinyalakan / dimatikan dari panel IRIS Gateway (menu ...). Dibuka oleh gateway.mjs (petJalan), bukan oleh pengguna.
# - Wajah mengikuti status: senang (WhatsApp tersambung), menunggu (menyambung), putus (terputus), tidur (Stop).
# - Bergerak hanya saat IRIS ditanya / disebut di grup (mengetik di laptop) dan saat menjawab (bersorak).
# - Klik = melambai, klik dua kali = berputar, geser = pindah tempat (kaki bergoyang), klik kanan = ukuran / sembunyikan.
# Hanya membaca http://127.0.0.1:<port>/api/pet. Tidak mengirim apa pun ke WhatsApp.
# File ini sengaja hanya berisi huruf ASCII (Windows PowerShell 5.1 membaca file tanpa BOM sebagai ANSI).
# Gambar robot (XAML di bawah) dibuat dari rancangan chibi; ubah lewat skrip pembuatnya bila perlu, bukan tangan.
param([int]$Port = 8737, [string]$Data = '')

$logFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'pet.log'
trap { try { Add-Content -Path $logFile -Value ((Get-Date -Format 's') + ' ' + $_ + ' @ baris ' + $_.InvocationInfo.ScriptLineNumber) -Encoding ASCII } catch {}; break }

$mutex = New-Object System.Threading.Mutex($false, 'Local\IRIS-Gateway-Pet')
if (-not $mutex.WaitOne(0)) { exit 0 }   # pet sudah tampil

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$api = 'http://127.0.0.1:' + $Port + '/api/'
if ($Data) { $posFile = Join-Path $Data 'pet-posisi.txt' } else { $posFile = Join-Path $env:TEMP 'iris-pet-posisi.txt' }

[xml]$xaml = @'
__XAML__
'@

$win = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
$n = @{}
foreach ($k in 'Ukuran','Sq','Rot','Mv','Bayang','WingL','WingR','RotL','RotR','RotKL','RotKR','Face','Glow','Kedip','Lirik','EyeL','EyeR','EyeHL','Mouth','Laptop','Ketikan','Bubble','BubbleText','mKecil','mSedang','mBesar','mSembunyi') {
  $n[$k] = $win.FindName($k)
  if ($null -eq $n[$k]) { throw ('Elemen XAML tidak ditemukan: ' + $k) }
}

# ---------- Wajah ----------
# Kotak mata 10 x 15 (titik kiri atas = Canvas.Left/Top EyeL / EyeR); mulut kotak 12 x 9.
$MATA = @{
  bulat  = 'M0,5 A5,5 0 0 1 10,5 L10,10 A5,5 0 0 1 0,10 Z'
  besar  = 'M-1,5 A6,5.5 0 0 1 11,5 L11,11 A6,5.5 0 0 1 -1,11 Z'
  senang = 'M-1,10.5 Q5,1.5 11,10.5'
  tidur  = 'M-1,7.5 Q5,11.5 11,7.5'
  putus  = 'M1,3.5 L9,11.5 M9,3.5 L1,11.5'
  prompt = 'M0,2.5 L8,7.5 L0,12.5'
  garis  = 'M0,9.5 L10,9.5'
}
$MULUT = @{
  senyum = 'M0,2 Q6,7 12,2'
  lebar  = 'M0,1 Q6,10 12,1 Z'
  datar  = 'M1,4 L11,4'
  o      = 'M3,4.5 A3,3.5 0 1 1 9,4.5 A3,3.5 0 1 1 3,4.5 Z'
  sedih  = 'M0,7 Q6,1 12,7'
  kosong = ''
}
$WARNA = @{ biru = '#5ADCFF'; kuning = '#FFC857'; merah = '#FF6B6B'; redup = '#4F86B0' }
$MOOD = @{
  senang = @('bulat', 'senyum', 'biru')
  tunggu = @('bulat', 'datar', 'kuning')
  putus  = @('putus', 'sedih', 'merah')
  tidur  = @('tidur', 'datar', 'redup')
}
$PENUH = @('bulat', 'besar')

function Wajah([string]$mata, [string]$mulut, [string]$w) {
  $c = [System.Windows.Media.ColorConverter]::ConvertFromString($WARNA[$w])
  $b = New-Object System.Windows.Media.SolidColorBrush $c
  $kanan = $mata
  if ($mata -eq 'prompt') { $kanan = 'garis' }
  $pasang = @(@($n.EyeL, $mata), @($n.EyeR, $kanan))
  foreach ($p in $pasang) {
    $p[0].Data = [System.Windows.Media.Geometry]::Parse($MATA[$p[1]])
    $p[0].Stroke = $b
    if ($PENUH -contains $p[1]) { $p[0].Fill = $b } else { $p[0].Fill = $null }
  }
  if ($mata -eq 'bulat') { $n.EyeHL.Visibility = 'Visible' } else { $n.EyeHL.Visibility = 'Collapsed' }
  if ($MULUT[$mulut]) { $n.Mouth.Data = [System.Windows.Media.Geometry]::Parse($MULUT[$mulut]) } else { $n.Mouth.Data = $null }
  $n.Mouth.Stroke = $b
  if ($mulut -eq 'lebar' -or $mulut -eq 'o') { $n.Mouth.Fill = $b } else { $n.Mouth.Fill = $null }
  $n.Glow.Color = $c
  $script:mata = $mata
  $script:wajah = $mata + '|' + $mulut + '|' + $w
}

# ---------- Animasi ----------
$Y = [System.Windows.Media.TranslateTransform]::YProperty
$X = [System.Windows.Media.TranslateTransform]::XProperty
$SX = [System.Windows.Media.ScaleTransform]::ScaleXProperty
$SY = [System.Windows.Media.ScaleTransform]::ScaleYProperty
$ANG = [System.Windows.Media.RotateTransform]::AngleProperty

# Bolak-balik dari..ke (ulang 0 = terus-menerus), mulai setelah tunda ms.
function Anim($obj, $prop, [double]$dari, [double]$ke, [int]$ms, [bool]$balik = $true, [double]$ulang = 1, [int]$tunda = 0) {
  $a = New-Object System.Windows.Media.Animation.DoubleAnimation
  $a.From = $dari
  $a.To = $ke
  $a.Duration = New-Object System.Windows.Duration ([TimeSpan]::FromMilliseconds($ms))
  $a.AutoReverse = $balik
  if ($tunda -gt 0) { $a.BeginTime = [TimeSpan]::FromMilliseconds($tunda) }
  if ($ulang -le 0) { $a.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever }
  else { $a.RepeatBehavior = New-Object System.Windows.Media.Animation.RepeatBehavior ($ulang) }
  $ease = New-Object System.Windows.Media.Animation.QuadraticEase
  $ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseInOut
  $a.EasingFunction = $ease
  $obj.BeginAnimation($prop, $a)
}
# Bergerak dari posisi sekarang ke nilai baru, lalu tetap di sana.
function Ke($obj, $prop, [double]$ke, [int]$ms) {
  $a = New-Object System.Windows.Media.Animation.DoubleAnimation
  $a.To = $ke
  $a.Duration = New-Object System.Windows.Duration ([TimeSpan]::FromMilliseconds($ms))
  $ease = New-Object System.Windows.Media.Animation.BackEase
  $ease.Amplitude = 0.4
  $ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
  $a.EasingFunction = $ease
  $obj.BeginAnimation($prop, $a)
}

function Lompat([int]$kali = 1, [double]$tinggi = 14) {
  Anim $n.Mv $Y 0 (-$tinggi) 170 $true $kali
  Anim $n.Bayang $SX 1 0.7 170 $true $kali
  Anim $n.Bayang $SY 1 0.7 170 $true $kali
}
function Miring([double]$sudut = 7) { Anim $n.Rot $ANG 0 $sudut 230 $true 1 }
function Gepeng { Anim $n.Sq $SY 1 0.88 110 $true 1; Anim $n.Sq $SX 1 1.07 110 $true 1 }
function Putar { Anim $n.Rot $ANG 0 360 650 $false 1 }
function Kepak([int]$kali = 2) { Anim $n.WingL $SX 1 0.72 140 $true $kali; Anim $n.WingR $SX 1 0.72 140 $true $kali }
function Lirik([bool]$on) { if ($on) { Anim $n.Lirik $X -2.5 2.5 700 $true 0 } else { $n.Lirik.BeginAnimation($X, $null) } }
function Tangan([double]$kiri, [double]$kanan, [int]$ms = 260) { Ke $n.RotL $ANG $kiri $ms; Ke $n.RotR $ANG $kanan $ms }
function Kaki([bool]$goyang) {
  if ($goyang) { Anim $n.RotKL $ANG -14 14 260 $true 0; Anim $n.RotKR $ANG 14 -14 260 $true 0 }
  else { Ke $n.RotKL $ANG 0 200; Ke $n.RotKR $ANG 0 200 }
}

# Pose: diam (tangan di samping), lambai, ketik (duduk mengetik di laptop), sorak (kedua tangan ke atas).
function Pose([string]$p) {
  if ($p -ne 'ketik') { $n.Laptop.Visibility = 'Collapsed'; $n.Ketikan.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $null) }
  if ($p -eq 'diam') { Tangan 12 -12 }
  elseif ($p -eq 'lambai') {
    Ke $n.RotL $ANG 12 200
    Anim $n.RotR $ANG -150 -118 170 $true 3
  } elseif ($p -eq 'ketik') {
    $n.Laptop.Visibility = 'Visible'
    Anim $n.RotL $ANG -55 -44 150 $true 0
    Anim $n.RotR $ANG 55 44 150 $true 0 75
    Anim $n.Ketikan ([System.Windows.UIElement]::OpacityProperty) 1 0.2 400 $true 0
  } elseif ($p -eq 'sorak') {
    Anim $n.RotL $ANG 165 150 180 $true 3
    Anim $n.RotR $ANG -165 -150 180 $true 3
  }
  $script:pose = $p
}

# ---------- Gelembung ----------
$bubbleTimer = New-Object System.Windows.Threading.DispatcherTimer
$bubbleTimer.Add_Tick({
  try {
    if ($script:menunggu -and $n.BubbleText.Text -ne '...') { $n.BubbleText.Text = '...'; $bubbleTimer.Interval = [TimeSpan]::FromSeconds(30); return }
    $bubbleTimer.Stop(); $n.Bubble.Visibility = 'Collapsed'
  } catch {}
})
function Gelembung([string]$teks, [int]$ms = 1500) {
  $n.BubbleText.Text = $teks
  $n.Bubble.Visibility = 'Visible'
  $bubbleTimer.Stop()
  if ($ms -gt 0) { $bubbleTimer.Interval = [TimeSpan]::FromMilliseconds($ms); $bubbleTimer.Start() }
}
function Emoji([int]$kode) { [char]::ConvertFromUtf32($kode) }

# ---------- Status dari gateway ----------
$script:mood = 'tunggu'
$script:sibuk = [DateTime]::MinValue
$script:menunggu = $false
$script:lastEv = -1
$script:gagal = $null
$script:wajah = ''
$script:mata = 'bulat'
$script:pose = 'diam'

function TerapkanMood {
  if ([DateTime]::Now -lt $script:sibuk) { return }
  if ($script:menunggu) { $script:menunggu = $false; Lirik $false }
  if ($script:pose -ne 'diam') { Pose 'diam' }
  $m = $MOOD[$script:mood]
  if ($script:wajah -ne ($m[0] + '|' + $m[1] + '|' + $m[2])) {
    Wajah $m[0] $m[1] $m[2]
    Lirik ($script:mood -eq 'tunggu')
  }
  if ($script:mood -eq 'tidur') { if ($n.Bubble.Visibility -ne 'Visible') { Gelembung 'z z' 0 } }
  elseif ($n.BubbleText.Text -eq 'z z' -and $n.Bubble.Visibility -eq 'Visible') { $n.Bubble.Visibility = 'Collapsed' }
}

function Kejadian([string]$k) {
  if ($k -eq 'dengar') {
    Lirik $false
    Wajah 'prompt' 'kosong' 'biru'
    Miring 6; Lompat 1 8
    Pose 'ketik'
    $script:menunggu = $true
    Gelembung '?' 1200
    $script:sibuk = [DateTime]::Now.AddSeconds(30)
  } elseif ($k -eq 'jawab') {
    $script:menunggu = $false
    Lirik $false
    Wajah 'senang' 'o' 'biru'
    Pose 'sorak'; Lompat 2 14; Kepak 4
    Gelembung (Emoji 0x2726) 2500
    $script:sibuk = [DateTime]::Now.AddMilliseconds(2600)
  } elseif ($k -eq 'diam') {
    $script:menunggu = $false
    $n.Bubble.Visibility = 'Collapsed'
    $script:sibuk = [DateTime]::MinValue
  }
}

function Tanya {
  try {
    $r = Invoke-RestMethod -Uri ($api + 'pet') -Headers @{ 'X-IRIS' = '1' } -TimeoutSec 2
    $script:gagal = $null
  } catch {
    if (-not $script:gagal) { $script:gagal = [DateTime]::Now }
    if (([DateTime]::Now - $script:gagal).TotalSeconds -gt 45) { $win.Close(); return }   # gateway ditutup
    $script:mood = 'tidur'; TerapkanMood
    return
  }
  if (-not $r.on) { $win.Close(); return }   # dimatikan dari panel
  $script:mood = [string]$r.mood
  if ($script:lastEv -lt 0 -or [int]$r.seq -lt $script:lastEv) { $script:lastEv = [int]$r.seq }   # awal / gateway dimulai ulang: kejadian lama dilewati
  foreach ($e in @($r.ev)) {
    if ($e -and [int]$e.id -gt $script:lastEv) { $script:lastEv = [int]$e.id; Kejadian ([string]$e.k) }
  }
  TerapkanMood
}

# ---------- Posisi & ukuran ----------
function SimpanPosisi {
  try { Set-Content -Path $posFile -Value (([int]$win.Left).ToString() + ',' + ([int]$win.Top).ToString() + ',' + $n.Ukuran.ScaleX.ToString([System.Globalization.CultureInfo]::InvariantCulture)) -Encoding ASCII } catch {}
}
function SetUkuran([double]$s) { $n.Ukuran.ScaleX = $s; $n.Ukuran.ScaleY = $s; SimpanPosisi }

$wa = [System.Windows.SystemParameters]::WorkArea
$win.Left = $wa.Right - 210
$win.Top = $wa.Bottom - 230
try {
  $p = (Get-Content -Path $posFile -ErrorAction Stop | Select-Object -First 1).Split(',')
  $vl = [System.Windows.SystemParameters]::VirtualScreenLeft; $vt = [System.Windows.SystemParameters]::VirtualScreenTop
  $vw = [System.Windows.SystemParameters]::VirtualScreenWidth; $vh = [System.Windows.SystemParameters]::VirtualScreenHeight
  $px = [double]$p[0]; $py = [double]$p[1]
  if ($px -ge $vl - 100 -and $px -le $vl + $vw - 60 -and $py -ge $vt - 60 -and $py -le $vt + $vh - 60) { $win.Left = $px; $win.Top = $py }
  if ($p.Count -ge 3) { $s = [double]$p[2]; if ($s -ge 0.5 -and $s -le 2.5) { $n.Ukuran.ScaleX = $s; $n.Ukuran.ScaleY = $s } }
} catch {}

# ---------- Interaksi ----------
$win.Add_MouseLeftButtonDown({
  param($s, $e)
  try {
    if ($e.ClickCount -ge 2) { Putar; Kepak 2; Wajah 'senang' 'lebar' 'biru'; Gelembung 'wiii!' 1200; $script:sibuk = [DateTime]::Now.AddMilliseconds(1300); return }
    $x0 = $win.Left; $y0 = $win.Top
    Kaki $true
    try { $win.DragMove() } catch {}
    Kaki $false
    if ([Math]::Abs($win.Left - $x0) -lt 3 -and [Math]::Abs($win.Top - $y0) -lt 3) {
      if ($script:menunggu) { return }
      switch (Get-Random -Maximum 3) {
        0 { Pose 'lambai'; Wajah 'senang' 'senyum' 'biru'; Gelembung 'hai!' 1500 }
        1 { Gepeng; Lompat 1 10; Wajah 'senang' 'lebar' 'biru'; Gelembung (Emoji 0x1F49B) 1500 }
        default { Miring -8; Kepak 2; Wajah 'senang' 'senyum' 'biru'; Gelembung 'hehe' 1500 }
      }
      $script:sibuk = [DateTime]::Now.AddMilliseconds(1700)
    } else { SimpanPosisi }
  } catch {}
})
$n.mKecil.Add_Click({ SetUkuran 0.9 })
$n.mSedang.Add_Click({ SetUkuran 1.25 })
$n.mBesar.Add_Click({ SetUkuran 1.7 })
$n.mSembunyi.Add_Click({
  try { Invoke-RestMethod -Uri ($api + 'pet-mati') -Method Post -Headers @{ 'X-IRIS' = '1' } -ContentType 'application/json' -Body '{}' -TimeoutSec 3 | Out-Null } catch {}
  $win.Close()
})

# ---------- Pengatur waktu ----------
$poll = New-Object System.Windows.Threading.DispatcherTimer
$poll.Interval = [TimeSpan]::FromMilliseconds(800)
$poll.Add_Tick({ try { Tanya } catch {} })

$kedip = New-Object System.Windows.Threading.DispatcherTimer
$kedip.Interval = [TimeSpan]::FromSeconds(3)
$kedip.Add_Tick({
  try {
    if ($PENUH -contains $script:mata) { Anim $n.Kedip $SY 1 0.1 80 $true 1 }
    $kedip.Interval = [TimeSpan]::FromMilliseconds((Get-Random -Minimum 2500 -Maximum 6500))
  } catch {}
})

$win.Add_Closed({ $poll.Stop(); $kedip.Stop(); try { $mutex.ReleaseMutex() } catch {} })

Wajah 'bulat' 'datar' 'kuning'
try { Tanya } catch {}
$poll.Start()
$kedip.Start()
[void]$win.ShowDialog()
