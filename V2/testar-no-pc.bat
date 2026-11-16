@echo off
setlocal
title DVR TV V2 - Teste no PC
cd /d "%~dp0"

set "DVR_PORT=8080"
if not "%~1"=="" set "DVR_PORT=%~1"

echo ========================================================
echo  DVR TV V2 - Teste local no PC
echo  Projeto LG webOS com interface V2
echo ========================================================

where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao foi encontrado no PATH.
    echo Instale o Node.js e execute este arquivo novamente.
    pause
    exit /b 1
)

if not exist "%~dp0server.js" (
    echo [ERRO] server.js nao encontrado em:
    echo %~dp0
    pause
    exit /b 1
)

echo Iniciando servidor na porta %DVR_PORT%...
echo Painel TV/PC: http://localhost:%DVR_PORT%/
echo Configuracao mobile: http://localhost:%DVR_PORT%/mobile
echo.
echo Para usar outra porta: testar-no-pc.bat 8081
echo Para encerrar: Ctrl+C nesta janela.
echo.

start "DVR TV V2" "http://localhost:%DVR_PORT%/"
set "PORT=%DVR_PORT%"
node "%~dp0server.js"

echo.
echo Servidor encerrado.
pause
endlocal
