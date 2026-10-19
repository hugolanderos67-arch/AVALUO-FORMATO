# Apaga el servidor de avalúos que quedó encendido en segundo plano. Lo usa el ícono "Detener PERITIA".
$connection = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
Add-Type -AssemblyName PresentationFramework
if (-not $connection) {
  [System.Windows.MessageBox]::Show('El servidor de PERITIA no estaba encendido.', 'PERITIA', 'OK', 'Information') | Out-Null
  exit 0
}
$process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
if ($process -and $process.ProcessName -eq 'node') {
  Stop-Process -Id $process.Id -Force
  [System.Windows.MessageBox]::Show('Servidor de PERITIA detenido. Los avalúos guardados no se pierden.', 'PERITIA', 'OK', 'Information') | Out-Null
} else {
  [System.Windows.MessageBox]::Show("El puerto 3000 lo usa otro programa ($($process.ProcessName)); no se detuvo.", 'PERITIA', 'OK', 'Warning') | Out-Null
}
