@echo off
cd /d "%~dp0"
start "" http://localhost:3000
npm start
rem Si el servidor se detiene (por ejemplo, porque el puerto 3000 ya estaba ocupado), la ventana queda abierta para leer el mensaje.
pause
