@echo off
title Servidor DVR TV - LG Smart TV e PC
echo ========================================================
echo  Iniciando Servidor DVR TV com Node.js (LG webOS / PC)
echo  Acesse no PC: http://localhost:8080/
echo ========================================================
start http://localhost:8080/
node "%~dp0server.js"
pause
