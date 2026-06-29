' Pawvy Business Manager - Silent Background Launcher
' Calls run-server.bat via cmd to ensure correct PATH

Dim objShell, appDir
Set objShell = CreateObject("WScript.Shell")

' Get this script's folder
appDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)

' Wait 3s for Windows to finish loading (important at startup)
WScript.Sleep 3000

' Run the server via cmd.exe — cmd always has the correct PATH
objShell.Run "cmd /c """ & appDir & "\run-server.bat""", 0, False

' Wait for server to initialise (sql.js takes a few seconds)
WScript.Sleep 10000

' Open Pawvy in the default browser
objShell.Run "http://localhost:3001"

Set objShell = Nothing
