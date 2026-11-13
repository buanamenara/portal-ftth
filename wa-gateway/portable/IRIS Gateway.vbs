' IRIS Gateway: menyalakan gateway tanpa jendela hitam, lalu membuka panel sebagai jendela aplikasi.
' "/diam" = hanya memastikan gateway menyala (dipakai jadwal "IRIS Gateway (jaga)"), tanpa membuka panel.
' Bila gateway sudah berjalan, yang kedua langsung berhenti sendiri, jadi aman dijalankan berkali-kali.
Option Explicit
Dim sh, fso, d, diam, edge, args, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
d = fso.GetParentFolderName(WScript.ScriptFullName)
diam = False
For i = 0 To WScript.Arguments.Count - 1
  If LCase(WScript.Arguments(i)) = "/diam" Then diam = True
Next
sh.Run "cmd /c """"" & d & "\bin\jalankan.bat""""", 0, False
If Not diam Then
  WScript.Sleep 3000
  edge = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
  If Not fso.FileExists(edge) Then edge = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"
  args = " --app=http://127.0.0.1:8737/ --window-size=1040,660 --no-first-run --no-default-browser-check --user-data-dir=""" & d & "\data\panel-browser"""
  If fso.FileExists(edge) Then
    sh.Run """" & edge & """" & args, 1, False
  Else
    sh.Run "http://127.0.0.1:8737/", 1, False
  End If
End If
