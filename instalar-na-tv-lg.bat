@echo off
chcp 65001 >nul
title Instalador DVR TV - LG Smart TVs (webOS)
color 0B
echo ========================================================
echo   INSTALADOR AUTOMATICO DO DVR TV NAS SMART TVs LG
echo ========================================================
echo.
echo Escolha qual TV deseja instalar/atualizar:
echo   [1] TV Cozinha (lgcozinha - 192.168.100.72)
echo   [2] TV Suite   (lgsuite   - 192.168.100.70)
echo   [3] Instalar em Ambas as TVs
echo.
set /p TV_CHOICE="Digite a opção (1, 2 ou 3) [Padrão: 1]: "

if "%TV_CHOICE%"=="2" goto INSTALL_SUITE
if "%TV_CHOICE%"=="3" goto INSTALL_BOTH
goto INSTALL_COZINHA

:INSTALL_COZINHA
echo.
echo ========================================================
echo   Instalando na TV Cozinha (lgcozinha - 192.168.100.72)
echo ========================================================
call npx -p @webos-tools/cli ares-install -d lgcozinha "%~dp0com.dvr.tv_1.0.0_all.ipk"
call npx -p @webos-tools/cli ares-launch -d lgcozinha com.dvr.tv
goto FINAL_MSG

:INSTALL_SUITE
echo.
echo ========================================================
echo   Instalando na TV Suite (lgsuite - 192.168.100.70)
echo ========================================================
call npx -p @webos-tools/cli ares-install -d lgsuite "%~dp0com.dvr.tv_1.0.0_all.ipk"
call npx -p @webos-tools/cli ares-launch -d lgsuite com.dvr.tv
goto FINAL_MSG

:INSTALL_BOTH
echo.
echo ========================================================
echo   [1/2] Instalando na TV Cozinha (lgcozinha)...
echo ========================================================
call npx -p @webos-tools/cli ares-install -d lgcozinha "%~dp0com.dvr.tv_1.0.0_all.ipk"
call npx -p @webos-tools/cli ares-launch -d lgcozinha com.dvr.tv

echo.
echo ========================================================
echo   [2/2] Instalando na TV Suite (lgsuite)...
echo ========================================================
call npx -p @webos-tools/cli ares-install -d lgsuite "%~dp0com.dvr.tv_1.0.0_all.ipk"
call npx -p @webos-tools/cli ares-launch -d lgsuite com.dvr.tv
goto FINAL_MSG

:FINAL_MSG
echo.
echo ========================================================
echo  SUCESSO! O DVR TV foi instalado e iniciado com sucesso!
echo ========================================================
pause
