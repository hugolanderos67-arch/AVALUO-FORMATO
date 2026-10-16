# Apaga el servidor de avalúos que quedó encendido en segundo plano. Lo usa el ícono "Detener Avalúos".
$connection = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
Add-Type -AssemblyName PresentationFramework
if (-not $connection) {
  [System.Windows.MessageBox]::Show('El servidor de Avalúos no estaba encendido.', 'Avalúos', 'OK', 'Information') | Out-Null
  exit 0
}
$process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
if ($process -and $process.ProcessName -eq 'node') {
  Stop-Process -Id $process.Id -Force
  [System.Windows.MessageBox]::Show('Servidor de Avalúos detenido. Los avalúos guardados no se pierden.', 'Avalúos', 'OK', 'Information') | Out-Null
} else {
  [System.Windows.MessageBox]::Show("El puerto 3000 lo usa otro programa ($($process.ProcessName)); no se detuvo.", 'Avalúos', 'OK', 'Warning') | Out-Null
}
