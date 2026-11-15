# 📋 Passo a Passo de Instalação na sua LG Smart TV

Dados da sua TV já cadastrados no seu computador:
- **Dispositivo:** `lgtv`
- **Endereço IP:** `192.168.100.72`
- **Porta:** `9922`
- **Usuário SSH:** `prisoner`
- **Pacote a ser instalado:** `com.dvr.tv_1.0.0_all.ipk`

---

## ⚡ Opção 1 (A Mais Fácil): Usar o Script Automático

Criei um instalador automático na pasta do projeto que faz tudo sozinho:

1. Na tela da TV (no aplicativo **Developer Mode**), confirme se a opção **Key Server** está em **ON** e anote a **Passphrase** de 6 dígitos exibida na tela.
2. No seu computador, dê dois cliques no arquivo:
   👉 **`instalar-na-tv-lg.bat`**
3. Quando a janela abrir, digite a **Passphrase** de 6 dígitos que está na TV e aperte **Enter**.
4. O script irá:
   - Limpar a chave antiga para evitar erro de senha.
   - Baixar a chave nova autenticada.
   - Instalar o pacote `com.dvr.tv_1.0.0_all.ipk`.
   - Abrir o app diretamente na sua TV!

---

## 🛠️ Opção 2: Fazer Manualmente pelo Terminal

Se preferir fazer diretamente pelo terminal onde você já estava:

### 1. Limpar a chave antiga com erro:
No terminal do VS Code ou PowerShell, execute:
```powershell
Remove-Item "$env:USERPROFILE\.ssh\lgtv_webos" -ErrorAction SilentlyContinue
```

### 2. Autenticar com a Passphrase atual da TV:
Substitua `SUA_SENHA` pela Passphrase de 6 dígitos visível na TV (respeitando letras maiúsculas):
```cmd
npx -p @webos-tools/cli ares-novacom --getkey -d lgtv --passphrase SUA_SENHA
```

### 3. Instalar o aplicativo na TV:
```cmd
npx -p @webos-tools/cli ares-install -d lgtv com.dvr.tv_1.0.0_all.ipk
```

### 4. Abrir o aplicativo na TV:
```cmd
npx -p @webos-tools/cli ares-launch -d lgtv com.dvr.tv
```

---

## ⚠️ Dicas Importantes sobre a Tela da TV:
1. **Key Server:** Precisa estar em **ON** durante a instalação.
2. **Maiúsculas:** Se a Passphrase tiver letras (ex: `06E6C5`), digite em **MAIÚSCULAS**.
3. **Mudança de Código:** Se o aplicativo na TV for fechado ou o Key Server for desligado/ligado, a TV gera um código novo. Use sempre o código exibido no momento em que você executa o comando.
