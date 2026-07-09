$proc = Start-Process -FilePath 'bun' -ArgumentList 'run','dev','--','--port','5199' -RedirectStandardOutput 'devserver.out.log' -RedirectStandardError 'devserver.err.log' -PassThru -NoNewWindow
$proc.Id | Out-File -FilePath 'devserver.pid' -Encoding ascii
Start-Sleep -Seconds 12
Write-Output '----- STDOUT -----'
if (Test-Path 'devserver.out.log') { Get-Content 'devserver.out.log' -Tail 25 }
Write-Output '----- STDERR -----'
if (Test-Path 'devserver.err.log') { Get-Content 'devserver.err.log' -Tail 25 }
