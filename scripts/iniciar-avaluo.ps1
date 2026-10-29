# Abre el sistema de avalúos como una aplicación: enciende el servidor en segundo plano (si no está encendido)
# y abre el formato en su propia ventana de Chrome o Edge. Lo usa el ícono "PERITIA" del escritorio.
# Con -SoloServidor solo enciende el servidor, sin abrir ventana: lo usa el inicio automático de Windows
# para que la app móvil encuentre PERITIA aunque nadie lo haya abierto.
param([switch]$SoloServidor)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$url = 'http://localhost:3000'
# La revisión usa 127.0.0.1: el servidor solo escucha en IPv4 y Windows resuelve "localhost" primero a IPv6 (::1).
$healthUrl = 'http://127.0.0.1:3000/health'

function Show-Message([string]$text, [string]$icon = 'Error') {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($text, 'PERITIA', 'OK', $icon) | Out-Null
}

function Test-Server {
  try {
    Invoke-WebRequest $healthUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Server)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    Show-Message "No se encontró Node.js en esta computadora.`n`nInstálelo desde https://nodejs.org (versión 24 o posterior) y vuelva a abrir PERITIA."
    exit 1
  }
  if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Show-Message "Faltan las librerías del sistema.`n`nAbra la carpeta AVALUO-FORMATO y ejecute instalar.bat (requiere internet esa vez)."
    exit 1
  }
  $dataDir = Join-Path $root 'data'
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $dataDir 'servidor.log') -RedirectStandardError (Join-Path $dataDir 'servidor-errores.log')

  $ready = $false
  for ($i = 0; $i -lt 40 -and -not $ready; $i++) {
    Start-Sleep -Milliseconds 250
    $ready = Test-Server
  }
  if (-not $ready) {
    $errors = Get-Content (Join-Path $dataDir 'servidor-errores.log') -Raw -ErrorAction SilentlyContinue
    Show-Message "El servidor de Avalúos no pudo iniciar.`n`n$errors`nRevise el archivo data\servidor-errores.log en la carpeta del sistema."
    exit 1
  }
}

if ($SoloServidor) { exit 0 }

# Ventana de aplicación (sin barras del navegador): Chrome si está instalado, si no Edge.
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) {
  Start-Process -FilePath $browser -ArgumentList "--app=$url"
} else {
  Start-Process $url
}
