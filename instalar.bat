@echo off
rem Instalacion del sistema de avaluos en esta computadora: revisa Node.js y crea los iconos.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se encontro Node.js en esta computadora.
  echo Instalelo desde https://nodejs.org ^(version 24 o posterior^) y vuelva a ejecutar instalar.bat.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 24 (
  echo.
  echo Esta computadora tiene Node.js version %NODE_MAJOR%; el sistema necesita la version 24 o posterior.
  echo Actualicelo desde https://nodejs.org y vuelva a ejecutar instalar.bat.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)
rem Los archivos descargados de internet vienen bloqueados; se desbloquean los scripts del sistema.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0scripts' -Filter *.ps1 | Unblock-File"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\crear-accesos-directos.ps1"
