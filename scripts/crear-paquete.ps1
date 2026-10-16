# Genera un ZIP del sistema para instalarlo en otra computadora, con la última versión guardada en git.
# No incluye la carpeta data (base de datos, fotos y documentos de los clientes) porque está fuera de git.
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$date = Get-Date -Format 'yyyy-MM-dd'
$zip = Join-Path $desktop "Avaluos-sistema-$date.zip"

Push-Location $root
try {
  $pending = git status --porcelain -- . ':!data'
  git archive --format=zip --prefix=AVALUO-FORMATO/ -o $zip HEAD
  Add-Type -AssemblyName PresentationFramework
  $note = if ($pending) { "`n`nAviso: hay cambios sin commit que NO se incluyeron; el paquete tiene la última versión guardada en git." } else { '' }
  [System.Windows.MessageBox]::Show("Paquete creado en el escritorio:`n$zip`n`nNo incluye su base de datos ni las fotos de sus avalúos.$note", 'Avalúos', 'OK', 'Information') | Out-Null
} finally {
  Pop-Location
}
