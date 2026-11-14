# Membuat pet.ps1 dari pet.tpl.ps1 + gambar chibi iRIS (XAML, koordinat desain 128x148).
# Jalankan setelah mengubah gambar atau template:  python3 wa-gateway/pet/buat-pet.py
OY = 22  # ruang di atas untuk gelembung & lompatan

def feather(cx, cy, L, W, ang, flip):
    s = -1 if flip else 1
    d = f"M0,0 C{L*0.25:.2f},{-W:.2f} {L*0.75:.2f},{-W*0.9:.2f} {L:.2f},{-W*0.15:.2f} C{L*0.8:.2f},{W*0.5:.2f} {L*0.3:.2f},{W*0.7:.2f} 0,0 Z"
    rib = f"M1,0 Q{L*0.5:.2f},{-W*0.25:.2f} {L*0.95:.2f},{-W*0.15:.2f}"
    tf = f'<TransformGroup><RotateTransform Angle="{ang}"/><ScaleTransform ScaleX="{s}"/><TranslateTransform X="{cx}" Y="{cy}"/></TransformGroup>'
    out = ''
    for data, extra in ((d, 'Fill="{StaticResource Bulu}" Stroke="#E7C772" StrokeThickness="0.7"'),
                        (rib, 'Stroke="#D8AE4E" StrokeThickness="0.8"'),
                        (d, 'Fill="{StaticResource Kilau}" Opacity="0.55"')):
        out += f'<Path Data="{data}" {extra}><Path.RenderTransform>{tf}</Path.RenderTransform></Path>\n'
    return out

def wing(side):
    f = side == 'L'
    bx = 64 + (-14 if f else 14)
    name = 'WingL' if f else 'WingR'
    s = ''.join(feather(bx, 92 + dy, L, W, a, f) for L, W, a, dy in [(34,8,-38,-2),(38,8,-20,2),(38,8,-4,6),(33,7,12,10),(26,6,28,13)])
    return (f'<Canvas><Canvas.RenderTransform><ScaleTransform x:Name="{name}" CenterX="{bx}" CenterY="92" ScaleX="1"/></Canvas.RenderTransform>\n{s}</Canvas>\n')

def laurel(side):
    s = -1 if side == 'L' else 1
    bx, by = 64 + s*30, 56
    out = ''
    for k, ang in enumerate([-112, -88, -64, -40, -16]):
        a = ang if s > 0 else 180 - ang
        L = 22 - k*1.6
        tf = f'<TransformGroup><RotateTransform Angle="{a}"/><TranslateTransform X="{bx + s*k*0.6:.2f}" Y="{by - k*1.6:.2f}"/></TransformGroup>'
        out += (f'<Path Data="M0,0 Q{L*0.45:.2f},-6 {L:.2f},0 Q{L*0.45:.2f},6 0,0Z" Fill="{{StaticResource Emas}}" Stroke="#8A6418" StrokeThickness="0.7"><Path.RenderTransform>{tf}</Path.RenderTransform></Path>\n'
                f'<Path Data="M1,0 L{L-2:.2f},0" Stroke="#FFF1B8" StrokeThickness="0.7" Opacity="0.8"><Path.RenderTransform>{tf}</Path.RenderTransform></Path>\n')
    return out

def rect(x, y, w, h, r, fill, stroke=None, st=0, extra=''):
    s = f' Stroke="{stroke}" StrokeThickness="{st}"' if stroke else ''
    return f'<Rectangle Canvas.Left="{x}" Canvas.Top="{y}" Width="{w}" Height="{h}" RadiusX="{r}" RadiusY="{r}" Fill="{fill}"{s} {extra}/>\n'

def ellipse(cx, cy, rx, ry, fill, stroke=None, st=0, extra=''):
    s = f' Stroke="{stroke}" StrokeThickness="{st}"' if stroke else ''
    return f'<Ellipse Canvas.Left="{cx-rx}" Canvas.Top="{cy-ry}" Width="{2*rx}" Height="{2*ry}" Fill="{fill}"{s} {extra}/>\n'

def limb(name, x, y, w, h, cx, cy, rot):
    inner = (rect(x, y, w, h, w/2, '{StaticResource Putih}', '#9D958A', 0.8)
             + rect(x+1.5, y+h*0.45, w-3, 2.2, 1.1, '{StaticResource Emas}')
             + ellipse(x+w/2, y+h-3, w/2+0.6, 3.6, '{StaticResource Emas}', '#8A6418', 0.6)
             + rect(x+1.6, y+2, 2, h*0.4, 1, '#FFFFFF', extra='Opacity="0.8"'))
    return f'<Canvas><Canvas.RenderTransform><RotateTransform x:Name="{name}" CenterX="{cx}" CenterY="{cy}" Angle="{rot}"/></Canvas.RenderTransform>\n{inner}</Canvas>\n'

def build():
    res = '''<Window.Resources>
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
'''
    g = ''
    g += wing('L') + wing('R')
    g += limb('RotKL', 52, 114, 10, 24, 57, 116, 0) + limb('RotKR', 66, 114, 10, 24, 71, 116, 0)
    g += '<Path Data="M45,97 Q45,85 64,85 Q83,85 83,97 L80.5,118 Q64,127 47.5,118 Z" Fill="{StaticResource Putih}" Stroke="#9D958A" StrokeThickness="0.9"/>\n'
    g += '<Path Data="M50,94 Q64,100 78,94" Stroke="#B9B1A4" StrokeThickness="0.7"/>\n'
    g += '<Path Data="M47.5,108 Q64,114 80.5,108" Stroke="{StaticResource Emas}" StrokeThickness="3"/>\n'
    g += '<Path Data="M53,88 Q64,92 75,88 L73,85.5 Q64,88.5 55,85.5 Z" Fill="{StaticResource Emas}"/>\n'
    g += ellipse(64, 98, 5.5, 5.5, '{StaticResource Inti}', '{StaticResource Emas}', 1.6)
    g += '<Path Data="M64,93.6 l1.3,3.1 3.1,1.3 -3.1,1.3 -1.3,3.1 -1.3,-3.1 -3.1,-1.3 3.1,-1.3z" Fill="#E9FDFF"/>\n'
    g += '<Path Data="M49,91 Q48,104 52,116" Stroke="#FFFFFF" StrokeThickness="2" Opacity="0.75" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>\n'
    g += limb('RotL', 40, 92, 9, 24, 44.5, 95, 12) + limb('RotR', 79, 92, 9, 24, 83.5, 95, -12)
    g += rect(58, 80, 12, 7, 3, '{StaticResource Logam}')
    g += laurel('L') + laurel('R')
    g += ellipse(64, 54, 34.5, 32.5, '{StaticResource Helm}', '#9D958A', 1)
    g += '<Path Data="M38,40 Q64,26 90,40" Stroke="#C9C1B3" StrokeThickness="0.8"/>\n'
    g += '<Path Data="M45,24 Q64,15 83,24" Stroke="{StaticResource Emas}" StrokeThickness="3.4" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>\n'
    g += ellipse(64, 20, 3, 3, '{StaticResource Inti}', '{StaticResource Emas}', 1.2)
    g += ellipse(50, 33, 10, 5, '#FFFFFF', extra='Opacity="0.85" RenderTransformOrigin="0.5,0.5"><Ellipse.RenderTransform><RotateTransform Angle="-25"/></Ellipse.RenderTransform></Ellipse').replace('"/>\n<', '"/>\n<').replace('></Ellipse/>', '></Ellipse>')
    g += ellipse(31, 58, 3.5, 7, '{StaticResource Emas}', '#8A6418', 0.6) + ellipse(97, 58, 3.5, 7, '{StaticResource Emas}', '#8A6418', 0.6)
    g += rect(37.5, 42, 53, 37, 17.5, '{StaticResource Emas}') + rect(39, 43.5, 50, 34, 16, '{StaticResource Visor}')
    g += '''<Canvas x:Name="Face" IsHitTestVisible="False">
  <Canvas.Effect><DropShadowEffect x:Name="Glow" Color="#5ADCFF" BlurRadius="7" ShadowDepth="0" Opacity="0.95"/></Canvas.Effect>
  <Canvas>
    <Canvas.RenderTransform><TransformGroup><ScaleTransform x:Name="Kedip" CenterX="64" CenterY="61" ScaleX="1" ScaleY="1"/><TranslateTransform x:Name="Lirik"/></TransformGroup></Canvas.RenderTransform>
    <Path x:Name="EyeL" Canvas.Left="49" Canvas.Top="53.5" StrokeThickness="3" StrokeStartLineCap="Round" StrokeEndLineCap="Round" StrokeLineJoin="Round"/>
    <Path x:Name="EyeR" Canvas.Left="69" Canvas.Top="53.5" StrokeThickness="3" StrokeStartLineCap="Round" StrokeEndLineCap="Round" StrokeLineJoin="Round"/>
    <Canvas x:Name="EyeHL">
      <Canvas.RenderTransform><TranslateTransform x:Name="KilauMata"/></Canvas.RenderTransform>
      <Ellipse Canvas.Left="50.8" Canvas.Top="55.3" Width="3.2" Height="4.4" Fill="#E9FDFF"/>
      <Ellipse Canvas.Left="70.8" Canvas.Top="55.3" Width="3.2" Height="4.4" Fill="#E9FDFF"/>
    </Canvas>
  </Canvas>
  <Path x:Name="Mouth" Canvas.Left="58" Canvas.Top="69" StrokeThickness="2.4" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
</Canvas>
'''
    g += '<Path Data="M44,50 Q52,45 62,45.5" Stroke="#FFFFFF" StrokeThickness="2.2" Opacity="0.35" StrokeStartLineCap="Round" StrokeEndLineCap="Round" IsHitTestVisible="False"/>\n'
    g += '<Path Data="M80,71 Q85,68 86,63" Stroke="#7FB7FF" StrokeThickness="1.4" Opacity="0.35" StrokeStartLineCap="Round" StrokeEndLineCap="Round" IsHitTestVisible="False"/>\n'
    g += ('<Canvas x:Name="Laptop" Visibility="Collapsed">\n'
          '<Path Data="M38,119 L90,119 L95,126 L33,126 Z" Fill="{StaticResource Logam}" Stroke="#555555" StrokeThickness="0.6"/>\n'
          + rect(43, 99, 42, 21, 2.5, '#141A2C', '#9AA3B8', 1.2) + rect(45, 101, 38, 17, 1.5, '{StaticResource Layar}') +
          '<Path x:Name="Ketikan" Data="M58,106 L62,109.5 L58,113 M64,113 L70,113" Stroke="#7FE6FF" StrokeThickness="1.6" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>\n</Canvas>\n')
    xaml = f'''<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="iRIS" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ResizeMode="NoResize" SizeToContent="WidthAndHeight"
        WindowStartupLocation="Manual">
{res}<Window.ContextMenu>
  <ContextMenu>
    <MenuItem x:Name="mKecil" Header="Ukuran kecil"/>
    <MenuItem x:Name="mSedang" Header="Ukuran sedang"/>
    <MenuItem x:Name="mBesar" Header="Ukuran besar"/>
    <Separator/>
    <MenuItem x:Name="mSembunyi" Header="Sembunyikan pet"/>
  </ContextMenu>
</Window.ContextMenu>
<Grid Width="140" Height="{148+OY}">
  <Grid.LayoutTransform><ScaleTransform x:Name="Ukuran" ScaleX="1.25" ScaleY="1.25"/></Grid.LayoutTransform>
  <Ellipse Width="50" Height="9" Margin="0,0,0,1" VerticalAlignment="Bottom" HorizontalAlignment="Center" Fill="{{StaticResource Bayangan}}" IsHitTestVisible="False">
    <Ellipse.RenderTransform><ScaleTransform x:Name="Bayang" CenterX="25" CenterY="4.5" ScaleX="1" ScaleY="1"/></Ellipse.RenderTransform>
  </Ellipse>
  <Canvas Width="128" Height="148" Margin="6,{OY},6,0" VerticalAlignment="Top" HorizontalAlignment="Left">
    <Canvas.RenderTransform>
      <TransformGroup><ScaleTransform x:Name="Sq" CenterX="64" CenterY="138" ScaleX="1" ScaleY="1"/><RotateTransform x:Name="Rot" CenterX="64" CenterY="138" Angle="0"/><RotateTransform x:Name="Putaran" CenterX="64" CenterY="78" Angle="0"/><TranslateTransform x:Name="Mv"/></TransformGroup>
    </Canvas.RenderTransform>
{g}  </Canvas>
  <Border x:Name="Bubble" Margin="0,0,2,0" VerticalAlignment="Top" HorizontalAlignment="Right" Background="#FFFFFDF7" BorderBrush="#C9A24A" BorderThickness="1.3"
          CornerRadius="10" Padding="8,1,8,2" Visibility="Collapsed" IsHitTestVisible="False">
    <TextBlock x:Name="BubbleText" FontFamily="Segoe UI Emoji, Segoe UI" FontSize="12" FontWeight="Bold" Foreground="#3A2E12"/>
  </Border>
</Grid>
</Window>'''
    return xaml
if __name__ == '__main__':
    import os
    d = os.path.dirname(os.path.abspath(__file__))
    t = open(os.path.join(d, 'pet.tpl.ps1'), encoding='ascii').read()
    out = t.replace('__XAML__', build())
    assert all(ord(c) < 128 for c in out), 'pet.ps1 harus ASCII'
    open(os.path.join(d, 'pet.ps1'), 'w', newline='\r\n').write(out)
    print('pet.ps1 dibuat')
