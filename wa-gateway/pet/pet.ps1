# Pet iRIS: robot kecil yang melayang di desktop laptop IRIS Gateway.
# Dinyalakan / dimatikan dari panel IRIS Gateway (menu ...). Dibuka oleh gateway.mjs (petJalan), bukan oleh pengguna.
# - Wajah mengikuti status: senang (WhatsApp tersambung), menunggu (menyambung), putus (terputus), tidur (Stop).
# - Bergerak hanya saat IRIS ditanya / disebut di grup (dengar) dan saat menjawab (jawab).
# - Klik = bereaksi, klik dua kali = berputar, geser = pindah tempat, klik kanan = ukuran / sembunyikan.
# Hanya membaca http://127.0.0.1:<port>/api/pet. Tidak mengirim apa pun ke WhatsApp.
# File ini sengaja hanya berisi huruf ASCII (Windows PowerShell 5.1 membaca file tanpa BOM sebagai ANSI).
param([int]$Port = 8737, [string]$Data = '')

$logFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'pet.log'
trap { try { Add-Content -Path $logFile -Value ((Get-Date -Format 's') + ' ' + $_ + ' @ baris ' + $_.InvocationInfo.ScriptLineNumber) -Encoding ASCII } catch {}; break }

$mutex = New-Object System.Threading.Mutex($false, 'Local\IRIS-Gateway-Pet')
if (-not $mutex.WaitOne(0)) { exit 0 }   # pet sudah tampil

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$api = 'http://127.0.0.1:' + $Port + '/api/'
if ($Data) { $posFile = Join-Path $Data 'pet-posisi.txt' } else { $posFile = Join-Path $env:TEMP 'iris-pet-posisi.txt' }

[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="iRIS" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ResizeMode="NoResize" SizeToContent="WidthAndHeight"
        WindowStartupLocation="Manual">
  <Window.ContextMenu>
    <ContextMenu>
      <MenuItem x:Name="mKecil" Header="Ukuran kecil"/>
      <MenuItem x:Name="mSedang" Header="Ukuran sedang"/>
      <MenuItem x:Name="mBesar" Header="Ukuran besar"/>
      <Separator/>
      <MenuItem x:Name="mSembunyi" Header="Sembunyikan pet"/>
    </ContextMenu>
  </Window.ContextMenu>
  <Grid x:Name="Root" Width="236" Height="178">
    <Grid.LayoutTransform><ScaleTransform x:Name="Ukuran" ScaleX="1" ScaleY="1"/></Grid.LayoutTransform>
    <Canvas x:Name="Pet" Width="236" Height="178" RenderTransformOrigin="0.5,0.95">
      <Canvas.RenderTransform>
        <TransformGroup>
          <ScaleTransform x:Name="Sq" ScaleX="1" ScaleY="1"/>
          <RotateTransform x:Name="Rot" Angle="0"/>
          <TranslateTransform x:Name="Mv" X="0" Y="0"/>
        </TransformGroup>
      </Canvas.RenderTransform>
      <Image x:Name="Body" Canvas.Left="5" Canvas.Top="38" Width="226" Height="138"/>
      <Canvas x:Name="Face" Canvas.Left="5" Canvas.Top="38" Width="226" Height="138" IsHitTestVisible="False">
        <Canvas.Effect><DropShadowEffect x:Name="Glow" Color="#5ADCFF" BlurRadius="10" ShadowDepth="0" Opacity="0.9"/></Canvas.Effect>
        <Canvas x:Name="Eyes" Width="226" Height="138">
          <Canvas.RenderTransform>
            <TransformGroup>
              <ScaleTransform x:Name="Kedip" CenterX="113" CenterY="57" ScaleX="1" ScaleY="1"/>
              <TranslateTransform x:Name="Lirik" X="0" Y="0"/>
            </TransformGroup>
          </Canvas.RenderTransform>
          <Path x:Name="EyeL" Canvas.Left="98" Canvas.Top="51" StrokeThickness="2.4" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
          <Path x:Name="EyeR" Canvas.Left="118" Canvas.Top="51" StrokeThickness="2.4" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
        </Canvas>
        <Path x:Name="Mouth" Canvas.Left="107" Canvas.Top="67" StrokeThickness="2.2" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
      </Canvas>
      <Border x:Name="Bubble" Canvas.Left="146" Canvas.Top="4" Background="#F7FFFDF5" BorderBrush="#C9A24A" BorderThickness="1.5"
              CornerRadius="13" Padding="10,2,10,3" Visibility="Collapsed" IsHitTestVisible="False">
        <TextBlock x:Name="BubbleText" FontFamily="Segoe UI Emoji, Segoe UI" FontSize="15" FontWeight="Bold" Foreground="#3A2E12"/>
      </Border>
    </Canvas>
  </Grid>
</Window>
'@

$win = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $xaml))
$n = @{}
foreach ($k in 'Ukuran','Sq','Rot','Mv','Body','Glow','Kedip','Lirik','EyeL','EyeR','Mouth','Bubble','BubbleText','mKecil','mSedang','mBesar','mSembunyi') { $n[$k] = $win.FindName($k) }

$bmp = New-Object System.Windows.Media.Imaging.BitmapImage
$bmp.BeginInit()
$bmp.UriSource = New-Object System.Uri (Join-Path $dir 'iris.png')
$bmp.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
$bmp.EndInit()
$n.Body.Source = $bmp

# ---------- Wajah ----------
$MATA = @{
  bulat  = 'M5,0 C8.3,0 10,2.6 10,6 C10,9.4 8.3,12 5,12 C1.7,12 0,9.4 0,6 C0,2.6 1.7,0 5,0 Z'
  besar  = 'M5,-2 C9,-2 11,2 11,6 C11,10 9,14 5,14 C1,14 -1,10 -1,6 C-1,2 1,-2 5,-2 Z'
  senang = 'M0,8 Q5,0 10,8'
  tidur  = 'M0,6 Q5,10 10,6'
  putus  = 'M1,2 L9,10 M9,2 L1,10'
}
$MULUT = @{
  senyum = 'M0,1 Q6,7 12,1'
  lebar  = 'M0,0 Q6,10 12,0 Z'
  datar  = 'M1,3 L11,3'
  o      = 'M6,0 C8.5,0 9,2 9,3.5 C9,5 8.5,7 6,7 C3.5,7 3,5 3,3.5 C3,2 3.5,0 6,0 Z'
  sedih  = 'M0,6 Q6,0 12,6'
}
$WARNA = @{ biru = '#5ADCFF'; kuning = '#FFC857'; merah = '#FF6B6B'; redup = '#4F86B0' }
$MOOD = @{
  senang = @('bulat', 'senyum', 'biru')
  tunggu = @('bulat', 'datar', 'kuning')
  putus  = @('putus', 'sedih', 'merah')
  tidur  = @('tidur', 'datar', 'redup')
}

function Wajah([string]$mata, [string]$mulut, [string]$warna) {
  $c = [System.Windows.Media.ColorConverter]::ConvertFromString($WARNA[$warna])
  $b = New-Object System.Windows.Media.SolidColorBrush $c
  foreach ($e in @($n.EyeL, $n.EyeR)) {
    $e.Data = [System.Windows.Media.Geometry]::Parse($MATA[$mata])
    $e.Stroke = $b
    if ($mata -eq 'bulat' -or $mata -eq 'besar') { $e.Fill = $b } else { $e.Fill = $null }
  }
  $n.Mouth.Data = [System.Windows.Media.Geometry]::Parse($MULUT[$mulut])
  $n.Mouth.Stroke = $b
  if ($mulut -eq 'lebar' -or $mulut -eq 'o') { $n.Mouth.Fill = $b } else { $n.Mouth.Fill = $null }
  $n.Glow.Color = $c
  $script:mata = $mata
  $script:wajah = $mata + '|' + $mulut + '|' + $warna
}

# ---------- Animasi ----------
function Anim($obj, $prop, [double]$dari, [double]$ke, [int]$ms, [bool]$balik = $true, [double]$ulang = 1) {
  $a = New-Object System.Windows.Media.Animation.DoubleAnimation
  $a.From = $dari
  $a.To = $ke
  $a.Duration = New-Object System.Windows.Duration ([TimeSpan]::FromMilliseconds($ms))
  $a.AutoReverse = $balik
  if ($ulang -le 0) { $a.RepeatBehavior = [System.Windows.Media.Animation.RepeatBehavior]::Forever }
  else { $a.RepeatBehavior = New-Object System.Windows.Media.Animation.RepeatBehavior ($ulang) }
  $ease = New-Object System.Windows.Media.Animation.QuadraticEase
  $ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
  $a.EasingFunction = $ease
  $obj.BeginAnimation($prop, $a)
}
$Y = [System.Windows.Media.TranslateTransform]::YProperty
$X = [System.Windows.Media.TranslateTransform]::XProperty
$SX = [System.Windows.Media.ScaleTransform]::ScaleXProperty
$SY = [System.Windows.Media.ScaleTransform]::ScaleYProperty
$ANG = [System.Windows.Media.RotateTransform]::AngleProperty

function Lompat([int]$kali = 1, [double]$tinggi = 16) { Anim $n.Mv $Y 0 (-$tinggi) 170 $true $kali }
function Miring([double]$sudut = 7) { Anim $n.Rot $ANG 0 $sudut 230 $true 1 }
function Gepeng { Anim $n.Sq $SY 1 0.86 110 $true 1; Anim $n.Sq $SX 1 1.08 110 $true 1 }
function Putar { Anim $n.Rot $ANG 0 360 650 $false 1 }
function Lirik([bool]$on) { if ($on) { Anim $n.Lirik $X -2.5 2.5 700 $true 0 } else { $n.Lirik.BeginAnimation($X, $null) } }

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

function TerapkanMood {
  if ([DateTime]::Now -lt $script:sibuk) { return }
  if ($script:menunggu) { $script:menunggu = $false; Lirik $false }
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
    Wajah 'besar' 'o' 'biru'
    Miring 8; Lompat 1 10
    $script:menunggu = $true
    Lirik $true
    Gelembung '?' 1200
    $script:sibuk = [DateTime]::Now.AddSeconds(30)
  } elseif ($k -eq 'jawab') {
    $script:menunggu = $false
    Lirik $false
    Wajah 'senang' 'lebar' 'biru'
    Lompat 2 16
    Gelembung (Emoji 0x2726) 2500
    $script:sibuk = [DateTime]::Now.AddMilliseconds(2600)
  } elseif ($k -eq 'diam') {
    $script:menunggu = $false
    Lirik $false
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
$win.Left = $wa.Right - 250
$win.Top = $wa.Bottom - 190
try {
  $p = (Get-Content -Path $posFile -ErrorAction Stop | Select-Object -First 1).Split(',')
  $vl = [System.Windows.SystemParameters]::VirtualScreenLeft; $vt = [System.Windows.SystemParameters]::VirtualScreenTop
  $vw = [System.Windows.SystemParameters]::VirtualScreenWidth; $vh = [System.Windows.SystemParameters]::VirtualScreenHeight
  $px = [double]$p[0]; $py = [double]$p[1]
  if ($px -ge $vl - 100 -and $px -le $vl + $vw - 60 -and $py -ge $vt - 60 -and $py -le $vt + $vh - 60) { $win.Left = $px; $win.Top = $py }
  if ($p.Count -ge 3) { $s = [double]$p[2]; if ($s -ge 0.5 -and $s -le 2) { $n.Ukuran.ScaleX = $s; $n.Ukuran.ScaleY = $s } }
} catch {}

# ---------- Interaksi ----------
$win.Add_MouseLeftButtonDown({
  param($s, $e)
  try {
    if ($e.ClickCount -ge 2) { Putar; Wajah 'senang' 'lebar' 'biru'; Gelembung 'wiii!' 1200; $script:sibuk = [DateTime]::Now.AddMilliseconds(1300); return }
    $x0 = $win.Left; $y0 = $win.Top
    try { $win.DragMove() } catch {}
    if ([Math]::Abs($win.Left - $x0) -lt 3 -and [Math]::Abs($win.Top - $y0) -lt 3) {
      if ($script:menunggu) { return }
      switch (Get-Random -Maximum 3) {
        0 { Gepeng; Wajah 'senang' 'senyum' 'biru'; Gelembung (Emoji 0x1F49B) 1400 }
        1 { Lompat 1 12; Wajah 'senang' 'lebar' 'biru'; Gelembung 'hehe' 1400 }
        default { Miring -8; Wajah 'senang' 'senyum' 'biru'; Gelembung '^_^' 1400 }
      }
      $script:sibuk = [DateTime]::Now.AddMilliseconds(1500)
    } else { SimpanPosisi }
  } catch {}
})
$n.mKecil.Add_Click({ SetUkuran 0.75 })
$n.mSedang.Add_Click({ SetUkuran 1 })
$n.mBesar.Add_Click({ SetUkuran 1.35 })
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
    if ($script:mata -eq 'bulat' -or $script:mata -eq 'besar') { Anim $n.Kedip $SY 1 0.1 80 $true 1 }
    $kedip.Interval = [TimeSpan]::FromMilliseconds((Get-Random -Minimum 2500 -Maximum 6500))
  } catch {}
})

$win.Add_Closed({ $poll.Stop(); $kedip.Stop(); try { $mutex.ReleaseMutex() } catch {} })

Wajah 'bulat' 'datar' 'kuning'
try { Tanya } catch {}
$poll.Start()
$kedip.Start()
[void]$win.ShowDialog()
