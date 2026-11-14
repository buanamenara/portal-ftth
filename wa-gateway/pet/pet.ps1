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
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="iRIS" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ResizeMode="NoResize" SizeToContent="WidthAndHeight"
        WindowStartupLocation="Manual">
<Window.Resources>
  <RadialGradientBrush x:Key="Helm" GradientOrigin="0.38,0.3" Center="0.38,0.3" RadiusX="0.85" RadiusY="0.85"><GradientStop Offset="0" Color="#FFFFFF"/><GradientStop Offset="0.55" Color="#F1EDE6"/><GradientStop Offset="0.85" Color="#D3CABB"/><GradientStop Offset="1" Color="#B3A996"/></RadialGradientBrush>
  <RadialGradientBrush x:Key="Putih" GradientOrigin="0.3,0.25" Center="0.3,0.25" RadiusX="1" RadiusY="1"><GradientStop Offset="0" Color="#FFFFFF"/><GradientStop Offset="0.6" Color="#ECE7DE"/><GradientStop Offset="1" Color="#BDB3A2"/></RadialGradientBrush>
  <LinearGradientBrush x:Key="Emas" StartPoint="0,0" EndPoint="0,1"><GradientStop Offset="0" Color="#FFF0B3"/><GradientStop Offset="0.35" Color="#E9C25E"/><GradientStop Offset="0.6" Color="#B98A2B"/><GradientStop Offset="0.8" Color="#E2B954"/><GradientStop Offset="1" Color="#8E6519"/></LinearGradientBrush>
  <LinearGradientBrush x:Key="Bulu" StartPoint="0,0" EndPoint="1,0"><GradientStop Offset="0" Color="#FFFFFF"/><GradientStop Offset="0.45" Color="#F6EEFF"/><GradientStop Offset="0.75" Color="#E3E6FF"/><GradientStop Offset="1" Color="#D2F3FF"/></LinearGradientBrush>
  <LinearGradientBrush x:Key="Kilau" StartPoint="0,0" EndPoint="1,1"><GradientStop Offset="0" Color="#00FFB8E8"/><GradientStop Offset="0.4" Color="#8CFFB8E8"/><GradientStop Offset="0.65" Color="#999EE7FF"/><GradientStop Offset="1" Color="#80FFF2A8"/></LinearGradientBrush>
  <LinearGradientBrush x:Key="Visor" StartPoint="0,0" EndPoint="0,1"><GradientStop Offset="0" Color="#26324F"/><GradientStop Offset="0.5" Color="#0D1222"/><GradientStop Offset="1" Color="#05070E"/></LinearGradientBrush>
  <RadialGradientBrush x:Key="Inti" GradientOrigin="0.4,0.35" Center="0.4,0.35" RadiusX="0.7" RadiusY="0.7"><GradientStop Offset="0" Color="#E9FDFF"/><GradientStop Offset="0.5" Color="#5ADCFF"/><GradientStop Offset="1" Color="#1A6FA8"/></RadialGradientBrush>
  <LinearGradientBrush x:Key="Logam" StartPoint="0,0" EndPoint="0,1"><GradientStop Offset="0" Color="#E8EAEE"/><GradientStop Offset="0.5" Color="#A9AFBA"/><GradientStop Offset="1" Color="#6E7480"/></LinearGradientBrush>
  <LinearGradientBrush x:Key="Layar" StartPoint="0,0" EndPoint="1,1"><GradientStop Offset="0" Color="#1F3A5C"/><GradientStop Offset="1" Color="#0B1426"/></LinearGradientBrush>
  <RadialGradientBrush x:Key="Bayangan"><GradientStop Offset="0" Color="#73000000"/><GradientStop Offset="1" Color="#00000000"/></RadialGradientBrush>
</Window.Resources>
<Window.ContextMenu>
  <ContextMenu>
    <MenuItem x:Name="mKecil" Header="Ukuran kecil"/>
    <MenuItem x:Name="mSedang" Header="Ukuran sedang"/>
    <MenuItem x:Name="mBesar" Header="Ukuran besar"/>
    <Separator/>
    <MenuItem x:Name="mSembunyi" Header="Sembunyikan pet"/>
  </ContextMenu>
</Window.ContextMenu>
<Grid Width="140" Height="170">
  <Grid.LayoutTransform><ScaleTransform x:Name="Ukuran" ScaleX="1.25" ScaleY="1.25"/></Grid.LayoutTransform>
  <Ellipse Width="50" Height="9" Margin="0,0,0,1" VerticalAlignment="Bottom" HorizontalAlignment="Center" Fill="{StaticResource Bayangan}" IsHitTestVisible="False">
    <Ellipse.RenderTransform><ScaleTransform x:Name="Bayang" CenterX="25" CenterY="4.5" ScaleX="1" ScaleY="1"/></Ellipse.RenderTransform>
  </Ellipse>
  <Canvas Width="128" Height="148" Margin="6,22,6,0" VerticalAlignment="Top" HorizontalAlignment="Left" RenderTransformOrigin="0.5,0.95">
    <Canvas.RenderTransform>
      <TransformGroup><ScaleTransform x:Name="Sq" ScaleX="1" ScaleY="1"/><RotateTransform x:Name="Rot" Angle="0"/><TranslateTransform x:Name="Mv"/></TransformGroup>
    </Canvas.RenderTransform>
<Canvas><Canvas.RenderTransform><ScaleTransform x:Name="WingL" CenterX="50" CenterY="92" ScaleX="1"/></Canvas.RenderTransform>
<Path Data="M0,0 C8.50,-8.00 25.50,-7.20 34.00,-1.20 C27.20,4.00 10.20,5.60 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-38"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="90"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q17.00,-2.00 32.30,-1.20" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-38"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="90"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C8.50,-8.00 25.50,-7.20 34.00,-1.20 C27.20,4.00 10.20,5.60 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-38"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="90"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C9.50,-8.00 28.50,-7.20 38.00,-1.20 C30.40,4.00 11.40,5.60 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-20"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="94"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q19.00,-2.00 36.10,-1.20" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-20"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="94"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C9.50,-8.00 28.50,-7.20 38.00,-1.20 C30.40,4.00 11.40,5.60 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-20"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="94"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C9.50,-8.00 28.50,-7.20 38.00,-1.20 C30.40,4.00 11.40,5.60 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-4"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="98"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q19.00,-2.00 36.10,-1.20" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-4"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="98"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C9.50,-8.00 28.50,-7.20 38.00,-1.20 C30.40,4.00 11.40,5.60 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-4"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="98"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C8.25,-7.00 24.75,-6.30 33.00,-1.05 C26.40,3.50 9.90,4.90 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="12"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="102"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q16.50,-1.75 31.35,-1.05" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="12"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="102"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C8.25,-7.00 24.75,-6.30 33.00,-1.05 C26.40,3.50 9.90,4.90 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="12"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="102"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C6.50,-6.00 19.50,-5.40 26.00,-0.90 C20.80,3.00 7.80,4.20 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="28"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="105"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q13.00,-1.50 24.70,-0.90" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="28"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="105"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C6.50,-6.00 19.50,-5.40 26.00,-0.90 C20.80,3.00 7.80,4.20 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="28"/><ScaleTransform ScaleX="-1"/><TranslateTransform X="50" Y="105"/></TransformGroup></Path.RenderTransform></Path>
</Canvas>
<Canvas><Canvas.RenderTransform><ScaleTransform x:Name="WingR" CenterX="78" CenterY="92" ScaleX="1"/></Canvas.RenderTransform>
<Path Data="M0,0 C8.50,-8.00 25.50,-7.20 34.00,-1.20 C27.20,4.00 10.20,5.60 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-38"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="90"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q17.00,-2.00 32.30,-1.20" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-38"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="90"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C8.50,-8.00 25.50,-7.20 34.00,-1.20 C27.20,4.00 10.20,5.60 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-38"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="90"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C9.50,-8.00 28.50,-7.20 38.00,-1.20 C30.40,4.00 11.40,5.60 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-20"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="94"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q19.00,-2.00 36.10,-1.20" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-20"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="94"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C9.50,-8.00 28.50,-7.20 38.00,-1.20 C30.40,4.00 11.40,5.60 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-20"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="94"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C9.50,-8.00 28.50,-7.20 38.00,-1.20 C30.40,4.00 11.40,5.60 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-4"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="98"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q19.00,-2.00 36.10,-1.20" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-4"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="98"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C9.50,-8.00 28.50,-7.20 38.00,-1.20 C30.40,4.00 11.40,5.60 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-4"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="98"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C8.25,-7.00 24.75,-6.30 33.00,-1.05 C26.40,3.50 9.90,4.90 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="12"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="102"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q16.50,-1.75 31.35,-1.05" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="12"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="102"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C8.25,-7.00 24.75,-6.30 33.00,-1.05 C26.40,3.50 9.90,4.90 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="12"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="102"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C6.50,-6.00 19.50,-5.40 26.00,-0.90 C20.80,3.00 7.80,4.20 0,0 Z" Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="28"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="105"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 Q13.00,-1.50 24.70,-0.90" Stroke="#D8AE4E" StrokeThickness="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="28"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="105"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 C6.50,-6.00 19.50,-5.40 26.00,-0.90 C20.80,3.00 7.80,4.20 0,0 Z" Fill="{StaticResource Kilau}" Opacity="0.55"><Path.RenderTransform><TransformGroup><RotateTransform Angle="28"/><ScaleTransform ScaleX="1"/><TranslateTransform X="78" Y="105"/></TransformGroup></Path.RenderTransform></Path>
</Canvas>
<Canvas><Canvas.RenderTransform><RotateTransform x:Name="RotKL" CenterX="57" CenterY="116" Angle="0"/></Canvas.RenderTransform>
<Rectangle Canvas.Left="52" Canvas.Top="114" Width="10" Height="24" RadiusX="5.0" RadiusY="5.0" Fill="{StaticResource Putih}" Stroke="#9D958A" StrokeThickness="0.8" />
<Rectangle Canvas.Left="53.5" Canvas.Top="124.8" Width="7" Height="2.2" RadiusX="1.1" RadiusY="1.1" Fill="{StaticResource Emas}" />
<Ellipse Canvas.Left="51.4" Canvas.Top="131.4" Width="11.2" Height="7.2" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.6" />
<Rectangle Canvas.Left="53.6" Canvas.Top="116" Width="2" Height="9.600000000000001" RadiusX="1" RadiusY="1" Fill="#FFFFFF" Opacity="0.8"/>
</Canvas>
<Canvas><Canvas.RenderTransform><RotateTransform x:Name="RotKR" CenterX="71" CenterY="116" Angle="0"/></Canvas.RenderTransform>
<Rectangle Canvas.Left="66" Canvas.Top="114" Width="10" Height="24" RadiusX="5.0" RadiusY="5.0" Fill="{StaticResource Putih}" Stroke="#9D958A" StrokeThickness="0.8" />
<Rectangle Canvas.Left="67.5" Canvas.Top="124.8" Width="7" Height="2.2" RadiusX="1.1" RadiusY="1.1" Fill="{StaticResource Emas}" />
<Ellipse Canvas.Left="65.4" Canvas.Top="131.4" Width="11.2" Height="7.2" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.6" />
<Rectangle Canvas.Left="67.6" Canvas.Top="116" Width="2" Height="9.600000000000001" RadiusX="1" RadiusY="1" Fill="#FFFFFF" Opacity="0.8"/>
</Canvas>
<Path Data="M45,97 Q45,85 64,85 Q83,85 83,97 L80.5,118 Q64,127 47.5,118 Z" Fill="{StaticResource Putih}" Stroke="#9D958A" StrokeThickness="0.9"/>
<Path Data="M50,94 Q64,100 78,94" Stroke="#B9B1A4" StrokeThickness="0.7"/>
<Path Data="M47.5,108 Q64,114 80.5,108" Stroke="{StaticResource Emas}" StrokeThickness="3"/>
<Path Data="M53,88 Q64,92 75,88 L73,85.5 Q64,88.5 55,85.5 Z" Fill="{StaticResource Emas}"/>
<Ellipse Canvas.Left="58.5" Canvas.Top="92.5" Width="11.0" Height="11.0" Fill="{StaticResource Inti}" Stroke="{StaticResource Emas}" StrokeThickness="1.6" />
<Path Data="M64,93.6 l1.3,3.1 3.1,1.3 -3.1,1.3 -1.3,3.1 -1.3,-3.1 -3.1,-1.3 3.1,-1.3z" Fill="#E9FDFF"/>
<Path Data="M49,91 Q48,104 52,116" Stroke="#FFFFFF" StrokeThickness="2" Opacity="0.75" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
<Canvas><Canvas.RenderTransform><RotateTransform x:Name="RotL" CenterX="44.5" CenterY="95" Angle="12"/></Canvas.RenderTransform>
<Rectangle Canvas.Left="40" Canvas.Top="92" Width="9" Height="24" RadiusX="4.5" RadiusY="4.5" Fill="{StaticResource Putih}" Stroke="#9D958A" StrokeThickness="0.8" />
<Rectangle Canvas.Left="41.5" Canvas.Top="102.8" Width="6" Height="2.2" RadiusX="1.1" RadiusY="1.1" Fill="{StaticResource Emas}" />
<Ellipse Canvas.Left="39.4" Canvas.Top="109.4" Width="10.2" Height="7.2" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.6" />
<Rectangle Canvas.Left="41.6" Canvas.Top="94" Width="2" Height="9.600000000000001" RadiusX="1" RadiusY="1" Fill="#FFFFFF" Opacity="0.8"/>
</Canvas>
<Canvas><Canvas.RenderTransform><RotateTransform x:Name="RotR" CenterX="83.5" CenterY="95" Angle="-12"/></Canvas.RenderTransform>
<Rectangle Canvas.Left="79" Canvas.Top="92" Width="9" Height="24" RadiusX="4.5" RadiusY="4.5" Fill="{StaticResource Putih}" Stroke="#9D958A" StrokeThickness="0.8" />
<Rectangle Canvas.Left="80.5" Canvas.Top="102.8" Width="6" Height="2.2" RadiusX="1.1" RadiusY="1.1" Fill="{StaticResource Emas}" />
<Ellipse Canvas.Left="78.4" Canvas.Top="109.4" Width="10.2" Height="7.2" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.6" />
<Rectangle Canvas.Left="80.6" Canvas.Top="94" Width="2" Height="9.600000000000001" RadiusX="1" RadiusY="1" Fill="#FFFFFF" Opacity="0.8"/>
</Canvas>
<Rectangle Canvas.Left="58" Canvas.Top="80" Width="12" Height="7" RadiusX="3" RadiusY="3" Fill="{StaticResource Logam}" />
<Path Data="M0,0 Q9.90,-6 22.00,0 Q9.90,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="292"/><TranslateTransform X="34.00" Y="56.00"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L20.00,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="292"/><TranslateTransform X="34.00" Y="56.00"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 Q9.18,-6 20.40,0 Q9.18,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="268"/><TranslateTransform X="33.40" Y="54.40"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L18.40,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="268"/><TranslateTransform X="33.40" Y="54.40"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 Q8.46,-6 18.80,0 Q8.46,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="244"/><TranslateTransform X="32.80" Y="52.80"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L16.80,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="244"/><TranslateTransform X="32.80" Y="52.80"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 Q7.74,-6 17.20,0 Q7.74,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="220"/><TranslateTransform X="32.20" Y="51.20"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L15.20,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="220"/><TranslateTransform X="32.20" Y="51.20"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 Q7.02,-6 15.60,0 Q7.02,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="196"/><TranslateTransform X="31.60" Y="49.60"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L13.60,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="196"/><TranslateTransform X="31.60" Y="49.60"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 Q9.90,-6 22.00,0 Q9.90,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-112"/><TranslateTransform X="94.00" Y="56.00"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L20.00,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-112"/><TranslateTransform X="94.00" Y="56.00"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 Q9.18,-6 20.40,0 Q9.18,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-88"/><TranslateTransform X="94.60" Y="54.40"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L18.40,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-88"/><TranslateTransform X="94.60" Y="54.40"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 Q8.46,-6 18.80,0 Q8.46,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-64"/><TranslateTransform X="95.20" Y="52.80"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L16.80,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-64"/><TranslateTransform X="95.20" Y="52.80"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 Q7.74,-6 17.20,0 Q7.74,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-40"/><TranslateTransform X="95.80" Y="51.20"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L15.20,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-40"/><TranslateTransform X="95.80" Y="51.20"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M0,0 Q7.02,-6 15.60,0 Q7.02,6 0,0Z" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-16"/><TranslateTransform X="96.40" Y="49.60"/></TransformGroup></Path.RenderTransform></Path>
<Path Data="M1,0 L13.60,0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform><TransformGroup><RotateTransform Angle="-16"/><TranslateTransform X="96.40" Y="49.60"/></TransformGroup></Path.RenderTransform></Path>
<Ellipse Canvas.Left="29.5" Canvas.Top="21.5" Width="69.0" Height="65.0" Fill="{StaticResource Helm}" Stroke="#9D958A" StrokeThickness="1" />
<Path Data="M38,40 Q64,26 90,40" Stroke="#C9C1B3" StrokeThickness="0.8"/>
<Path Data="M45,24 Q64,15 83,24" Stroke="{StaticResource Emas}" StrokeThickness="3.4" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
<Ellipse Canvas.Left="61" Canvas.Top="17" Width="6" Height="6" Fill="{StaticResource Inti}" Stroke="{StaticResource Emas}" StrokeThickness="1.2" />
<Ellipse Canvas.Left="40" Canvas.Top="28" Width="20" Height="10" Fill="#FFFFFF" Opacity="0.85" RenderTransformOrigin="0.5,0.5"><Ellipse.RenderTransform><RotateTransform Angle="-25"/></Ellipse.RenderTransform></Ellipse>
<Ellipse Canvas.Left="27.5" Canvas.Top="51" Width="7.0" Height="14" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.6" />
<Ellipse Canvas.Left="93.5" Canvas.Top="51" Width="7.0" Height="14" Fill="{StaticResource Emas}" Stroke="#8A6418" StrokeThickness="0.6" />
<Rectangle Canvas.Left="37.5" Canvas.Top="42" Width="53" Height="37" RadiusX="17.5" RadiusY="17.5" Fill="{StaticResource Emas}" />
<Rectangle Canvas.Left="39" Canvas.Top="43.5" Width="50" Height="34" RadiusX="16" RadiusY="16" Fill="{StaticResource Visor}" />
<Canvas x:Name="Face" IsHitTestVisible="False">
  <Canvas.Effect><DropShadowEffect x:Name="Glow" Color="#5ADCFF" BlurRadius="7" ShadowDepth="0" Opacity="0.95"/></Canvas.Effect>
  <Canvas>
    <Canvas.RenderTransform><TransformGroup><ScaleTransform x:Name="Kedip" CenterX="64" CenterY="61" ScaleX="1" ScaleY="1"/><TranslateTransform x:Name="Lirik"/></TransformGroup></Canvas.RenderTransform>
    <Path x:Name="EyeL" Canvas.Left="49" Canvas.Top="53.5" StrokeThickness="3" StrokeStartLineCap="Round" StrokeEndLineCap="Round" StrokeLineJoin="Round"/>
    <Path x:Name="EyeR" Canvas.Left="69" Canvas.Top="53.5" StrokeThickness="3" StrokeStartLineCap="Round" StrokeEndLineCap="Round" StrokeLineJoin="Round"/>
    <Canvas x:Name="EyeHL">
      <Ellipse Canvas.Left="50.8" Canvas.Top="55.3" Width="3.2" Height="4.4" Fill="#E9FDFF"/>
      <Ellipse Canvas.Left="70.8" Canvas.Top="55.3" Width="3.2" Height="4.4" Fill="#E9FDFF"/>
    </Canvas>
  </Canvas>
  <Path x:Name="Mouth" Canvas.Left="58" Canvas.Top="69" StrokeThickness="2.4" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
</Canvas>
<Path Data="M44,50 Q52,45 62,45.5" Stroke="#FFFFFF" StrokeThickness="2.2" Opacity="0.35" StrokeStartLineCap="Round" StrokeEndLineCap="Round" IsHitTestVisible="False"/>
<Path Data="M80,71 Q85,68 86,63" Stroke="#7FB7FF" StrokeThickness="1.4" Opacity="0.35" StrokeStartLineCap="Round" StrokeEndLineCap="Round" IsHitTestVisible="False"/>
<Canvas x:Name="Laptop" Visibility="Collapsed">
<Path Data="M38,119 L90,119 L95,126 L33,126 Z" Fill="{StaticResource Logam}" Stroke="#555555" StrokeThickness="0.6"/>
<Rectangle Canvas.Left="43" Canvas.Top="99" Width="42" Height="21" RadiusX="2.5" RadiusY="2.5" Fill="#141A2C" Stroke="#9AA3B8" StrokeThickness="1.2" />
<Rectangle Canvas.Left="45" Canvas.Top="101" Width="38" Height="17" RadiusX="1.5" RadiusY="1.5" Fill="{StaticResource Layar}" />
<Path x:Name="Ketikan" Data="M58,106 L62,109.5 L58,113 M64,113 L70,113" Stroke="#7FE6FF" StrokeThickness="1.6" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
</Canvas>
  </Canvas>
  <Border x:Name="Bubble" Margin="0,0,2,0" VerticalAlignment="Top" HorizontalAlignment="Right" Background="#FFFFFDF7" BorderBrush="#C9A24A" BorderThickness="1.3"
          CornerRadius="10" Padding="8,1,8,2" Visibility="Collapsed" IsHitTestVisible="False">
    <TextBlock x:Name="BubbleText" FontFamily="Segoe UI Emoji, Segoe UI" FontSize="12" FontWeight="Bold" Foreground="#3A2E12"/>
  </Border>
</Grid>
</Window>
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

function Wajah([string]$mata, [string]$mulut, [string]$warna) {
  $c = [System.Windows.Media.ColorConverter]::ConvertFromString($WARNA[$warna])
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
  $script:wajah = $mata + '|' + $mulut + '|' + $warna
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
