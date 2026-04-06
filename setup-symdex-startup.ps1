$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\SymDex.lnk")
$Shortcut.TargetPath = "symdex"
$Shortcut.Arguments = "serve"
$Shortcut.Save()
