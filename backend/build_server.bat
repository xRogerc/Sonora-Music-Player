@echo off
setlocal
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
  set "PY=.venv\Scripts\python.exe"
) else (
  set "PY=python"
)

"%PY%" -m pip show PyInstaller >nul 2>&1
if errorlevel 1 (
  echo Instalando PyInstaller...
  "%PY%" -m pip install PyInstaller
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar PyInstaller.
    exit /b 1
  )
)

"%PY%" -m PyInstaller --onefile --noconsole --name sonora-server --hidden-import django.contrib.admin --hidden-import django.contrib.auth --hidden-import django.contrib.sessions --hidden-import django.contrib.messages --hidden-import django.contrib.staticfiles --hidden-import rest_framework --hidden-import rest_framework.authtoken --hidden-import corsheaders --hidden-import core --collect-all ytmusicapi --collect-all yt_dlp desktop_server.py
if errorlevel 1 (
  echo [ERRO] PyInstaller falhou.
  exit /b 1
)

echo.
echo Pronto: %~dp0dist\sonora-server.exe
endlocal