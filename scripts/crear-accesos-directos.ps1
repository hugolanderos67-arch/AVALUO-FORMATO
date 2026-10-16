# Crea los íconos "Avalúos" y "Detener Avalúos" en el escritorio y en el menú Inicio.
# Se ejecuta una vez en cada computadora: clic derecho > Ejecutar con PowerShell.
$root = Split-Path -Parent $PSScriptRoot
$icon = Join-Path $root 'assets\avaluo.ico'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shell = New-Object -ComObject WScript.Shell

function New-Shortcut([string]$folder, [string]$name, [string]$script, [string]$description) {
  $shortcut = $shell.CreateShortcut((Join-Path $folder "$name.lnk"))
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $root "scripts\$script")`""
  $shortcut.WorkingDirectory = $root
  $shortcut.IconLocation = "$icon,0"
  $shortcut.WindowStyle = 7
  $shortcut.Description = $description
  $shortcut.Save()
}

$folders = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
foreach ($folder in $folders) {
  New-Shortcut $folder 'Avalúos' 'iniciar-avaluo.ps1' 'Abrir el sistema de avalúos'
}
New-Shortcut ([Environment]::GetFolderPath('Programs')) 'Detener Avalúos' 'detener-avaluo.ps1' 'Apagar el servidor de avalúos'

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show("Listo: el ícono 'Avalúos' quedó en el escritorio y en el menú Inicio.`n`nPara apagar el servidor use 'Detener Avalúos' del menú Inicio.", 'Avalúos', 'OK', 'Information') | Out-Null
