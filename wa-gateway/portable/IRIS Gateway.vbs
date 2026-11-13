' IRIS Gateway: menyalakan gateway di balik layar (tanpa jendela hitam, tanpa jendela panel).
' Panel hanya dibuka bila diminta: "/panel" (shortcut "IRIS Gateway" di Desktop).
' "/diam" = jadwal "IRIS Gateway (jaga)": hanya memastikan gateway menyala, dan tidak menyalakan bila program
'          ditutup dari panel (data\tutup.flag).
' Tanpa argumen (jadwal login): tanda tutup dibuang lalu gateway dinyalakan, tetap tanpa panel.
' Bila gateway sudah berjalan, yang kedua langsung berhenti sendiri, jadi aman dijalankan berkali-kali.
Option Explicit
Dim sh, fso, d, diam, panel, edge, args, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
d = fso.GetParentFolderName(WScript.ScriptFullName)
diam = False
panel = False
For i = 0 To WScript.Arguments.Count - 1
  If LCase(WScript.Arguments(i)) = "/diam" Then diam = True
  If LCase(WScript.Arguments(i)) = "/panel" Then panel = True
Next
If diam And fso.FileExists(d & "\data\tutup.flag") Then WScript.Quit
If fso.FileExists(d & "\data\tutup.flag") Then fso.DeleteFile d & "\data\tutup.flag", True
sh.Run "cmd /c """"" & d & "\bin\jalankan.bat""""", 0, False
If panel Then
  WScript.Sleep 3000
  edge = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
  If Not fso.FileExists(edge) Then edge = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"
  args = " --app=http://127.0.0.1:8737/ --window-size=900,420 --no-first-run --no-default-browser-check --user-data-dir=""" & d & "\data\panel-browser"""
  If fso.FileExists(edge) Then
    sh.Run """" & edge & """" & args, 1, False
  Else
    sh.Run "http://127.0.0.1:8737/", 1, False
  End If
End If
