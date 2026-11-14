@echo off
echo ========================================================
echo  Empacotando DVR TV para LG Smart TV (webOS .ipk)
echo ========================================================

REM Garante variavel local APPDATA para o ares-package no Windows
set "APPDATA=%~dp0.appdata"

echo Gerando pacote webOS (.ipk)...
call npx -p @webos-tools/cli ares-package -e ".git" -e "Debug" -e ".tizen-rds" -e "certificado" -e ".appdata" -e "*.bat" -e "*.ps1" -e "*.md" -e "*.wgt" -e "server.js" -o . .

if exist com.dvr.tv_1.0.0_all.ipk (
    echo.
    echo [SUCESSO] Pacote com.dvr.tv_1.0.0_all.ipk gerado com sucesso!
) else (
    echo.
    echo [AVISO] Tentando empacotamento com ares-package global...
    ares-package -e ".git" -e "Debug" -e ".tizen-rds" -e "certificado" -e ".appdata" -e "*.bat" -e "*.ps1" -e "*.md" -e "*.wgt" -e "server.js" -o . .
)

REM Gera também o pacote Tizen .wgt para quem quiser manter compatibilidade Samsung
echo.
echo Gerando copia de compatibilidade Samsung (.wgt)...
if exist dvrtv.wgt del dvrtv.wgt
tar.exe -a -cf dvrtv.wgt config.xml icon.png index.html css js
if exist dvrtv.wgt (
    echo [SUCESSO] Pacote dvrtv.wgt gerado com sucesso!
)

echo.
echo ========================================================
echo  Processo finalizado!
echo ========================================================
pause
