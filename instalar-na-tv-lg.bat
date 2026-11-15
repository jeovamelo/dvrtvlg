@echo off
chcp 65001 >nul
title Instalador DVR TV - LG Smart TV (webOS)
color 0B
echo ========================================================
echo   INSTALADOR AUTOMATICO DO DVR TV NA LG SMART TV
echo ========================================================
echo.
echo TV configurada: lgtv (IP: 192.168.100.72)
echo.
echo [1/3] Removendo chave temporaria antiga (para evitar erro de senha)...
if exist "%USERPROFILE%\.ssh\lgtv_webos" del /f /q "%USERPROFILE%\.ssh\lgtv_webos" >nul 2>&1
echo       Concluido!
echo.
echo [2/3] Autenticacao com a TV:
echo       1. Olhe para a tela da TV no aplicativo Developer Mode.
echo       2. Certifique-se de que a opcao 'Key Server' esta em ON.
echo       3. Localize a Passphrase de 6 digitos exibida na tela.
echo.
set /p PASSPHRASE="Digite a Passphrase exatamente como esta na TV: "

if "%PASSPHRASE%"=="" (
    echo.
    echo [ERRO] A Passphrase nao pode ser vazia!
    pause
    exit /b 1
)

echo.
echo Conectando e obtendo chave SSH com a Passphrase %PASSPHRASE%...
call npx -p @webos-tools/cli ares-novacom --getkey -d lgtv --passphrase %PASSPHRASE%

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================================
    echo [ERRO] Nao foi possivel autenticar com a TV.
    echo  - Verifique se a Passphrase mudou na tela da TV.
    echo  - Se tiver letras, digite MAIUSCULAS exatamente iguais.
    echo  - Confirme se 'Key Server' ainda esta em ON na TV.
    echo ========================================================
    pause
    exit /b 1
)

echo.
echo [3/3] Instalando o aplicativo na TV LG...
call npx -p @webos-tools/cli ares-install -d lgtv "%~dp0com.dvr.tv_1.0.0_all.ipk"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha ao instalar o pacote na TV.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo  SUCESSO! DVR TV instalado com sucesso na sua TV LG!
echo ========================================================
echo.
echo Abrindo o aplicativo na TV agora...
call npx -p @webos-tools/cli ares-launch -d lgtv com.dvr.tv

echo.
echo Pronto! O aplicativo ja esta na tela da sua TV.
pause
