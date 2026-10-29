# Crea los íconos "PERITIA" y "Detener PERITIA" en el escritorio y en el menú Inicio
# (y quita los anteriores "Avalúos" y "Detener Avalúos" si existen).
# Se ejecuta una vez en cada computadora: clic derecho > Ejecutar con PowerShell.
$root = Split-Path -Parent $PSScriptRoot
$icon = Join-Path $root 'assets\avaluo.ico'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shell = New-Object -ComObject WScript.Shell

function New-Shortcut([string]$folder, [string]$name, [string]$script, [string]$description, [string]$extra = '') {
  $shortcut = $shell.CreateShortcut((Join-Path $folder "$name.lnk"))
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $root "scripts\$script")`" $extra".TrimEnd()
  $shortcut.WorkingDirectory = $root
  $shortcut.IconLocation = "$icon,0"
  $shortcut.WindowStyle = 7
  $shortcut.Description = $description
  $shortcut.Save()
}

$folders = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))
foreach ($folder in $folders) {
  foreach ($old in @('Avalúos.lnk', 'Detener Avalúos.lnk')) {
    $oldPath = Join-Path $folder $old
    if (Test-Path -LiteralPath $oldPath) { Remove-Item -LiteralPath $oldPath }
  }
  New-Shortcut $folder 'PERITIA' 'iniciar-avaluo.ps1' 'PERITIA · Ecosistema de valuación profesional'
  New-Shortcut $folder 'Detener PERITIA' 'detener-avaluo.ps1' 'Apagar el servidor de PERITIA'
}

# Inicio automático: al entrar a Windows enciende el servidor (sin ventana) para que la app móvil se conecte.
New-Shortcut ([Environment]::GetFolderPath('Startup')) 'PERITIA (servidor)' 'iniciar-avaluo.ps1' 'Enciende el servidor de PERITIA al iniciar Windows' '-SoloServidor'

Add-Type -AssemblyName PresentationFramework
if ($env:PERITIA_SIN_AVISO -ne '1') {
  [System.Windows.MessageBox]::Show("Listo: el ícono 'PERITIA' quedó en el escritorio y en el menú Inicio, y el servidor se encenderá solo al iniciar Windows.`n`nPara apagar el servidor use 'Detener PERITIA' del escritorio o del menú Inicio.", 'PERITIA', 'OK', 'Information') | Out-Null
}
