$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $projectDir 'TutIn Desktop.vbs'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'TutIn.lnk'
$electronExe = Join-Path $projectDir 'node_modules\electron\dist\electron.exe'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:WINDIR\System32\wscript.exe"
$shortcut.Arguments = "`"$launcher`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description = 'Launch TutIn desktop app'

if (Test-Path $electronExe) {
    $shortcut.IconLocation = "$electronExe,0"
}

$shortcut.Save()
Write-Host "Created shortcut: $shortcutPath"
