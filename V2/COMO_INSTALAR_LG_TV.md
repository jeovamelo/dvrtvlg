# 📺 Guia de Instalação do Aplicativo DVR TV na LG Smart TV (webOS)

Este aplicativo foi adaptado especialmente para televisores **LG Smart TV (webOS)** para acessar e visualizar em tempo real as 16 câmeras do seu DVR Hikvision (**DVR01Casa**) com layout em grade 4x4, tela cheia e painel de configurações na tela.

---

## 🚀 Método 1: Acesso Imediato pelo Navegador da LG TV (Sem Instalar Nada)

Você pode testar e usar o aplicativo instantaneamente na sua LG TV através do navegador integrado:

1. No seu computador (na mesma rede Wi-Fi/cabo da TV), execute o arquivo:
   ```cmd
   start-server.bat
   ```
2. O prompt mostrará o endereço local, por exemplo: `http://192.168.100.X:8080/` (descubra o IP do PC abrindo o prompt e digitando `ipconfig`).
3. Na sua LG Smart TV, abra o aplicativo **Navegador Web** (Web Browser da LG).
4. Digite a URL do seu computador com a porta 8080:
   ```text
   http://192.168.100.X:8080/
   ```
5. O aplicativo abrirá com a grade de 16 câmeras! Você pode usar as setas do controle remoto ou o cursor do **Magic Remote** para navegar e clicar.

---

## 📦 Método 2: Instalação Nativa na LG TV (Pacote .ipk)

O arquivo compilado pronto para instalação na TV é gerado na pasta:
```text
com.dvr.tv_1.0.0_all.ipk
```
*(Você pode recompilar a qualquer momento dando dois cliques no arquivo `build-package.bat`).*

---

### Passo 1: Habilitar o Modo Desenvolvedor na LG Smart TV
1. Crie uma conta gratuita no portal de desenvolvedores da LG: [https://webostv.developer.lge.com/](https://webostv.developer.lge.com/) (ou utilize sua conta LG existente).
2. Na sua LG TV, abra a loja de aplicativos (**LG Content Store** ou **Apps**).
3. Busque pelo aplicativo **Developer Mode** e instale-o.
4. Abra o **Developer Mode** na TV e faça login com a sua conta LG.
5. Na tela do app:
   - Ative a opção **Dev Mode Status** (coloque em **ON**).
   - Ative a opção **Key Server** (coloque em **ON**).
   - Anote o **IP da TV** e a **Passphrase** (senha temporária de 6 dígitos) exibidos na tela.

---

### Passo 2: Cadastrar a TV no seu Computador
No computador, abra o PowerShell ou Prompt de Comando na pasta do projeto e configure a TV executando:
```cmd
npx -p @webos-tools/cli ares-setup-device
```
1. Escolha a opção **add**.
2. Preencha os dados solicitados:
   - **Device Name:** `lgtv`
   - **IP Address:** *(O IP da sua TV anotado no Passo 1)*
   - **Port:** `9922` *(padrão)*
   - **SSH Key:** Digite a **Passphrase** exibida na tela da TV.

Em seguida, obtenha a chave SSH de autenticação com:
```cmd
npx -p @webos-tools/cli ares-novacom --getkey -d lgtv
```

---

### Passo 3: Instalar e Executar o Pacote na TV
Ainda na pasta do projeto, execute o comando de instalação:
```cmd
npx -p @webos-tools/cli ares-install -d lgtv com.dvr.tv_1.0.0_all.ipk
```
Para iniciar o aplicativo imediatamente na TV:
```cmd
npx -p @webos-tools/cli ares-launch -d lgtv com.dvr.tv
```
*O ícone do **DVR TV** aparecerá diretamente na barra inicial de aplicativos da sua LG Smart TV!*

---

## 🎮 Controles e Atalhos no Controle Remoto da LG TV

| Tecla do Controle | Função no Aplicativo |
| :--- | :--- |
| **▲ ▼ ◄ ► (Setas D-Pad)** | Navega entre as câmeras na grade com destaque luminoso |
| **OK / Scroll do Magic Remote** | Abre a câmera selecionada em **Tela Cheia** / Confirma campos |
| **Voltar (Back / Return)** | Sai da tela cheia, fecha o modal de configurações ou sai do app |
| **🔴 Tecla Vermelha** | Reconecta ao DVR e atualiza os feeds |
| **🟢 Tecla Verde** | Alterna os modos de grade: **4x4 (16 câmeras)**, **3x3**, **2x2** ou **1x1** |
| **🟡 Tecla Amarela** | Alterna qualidade: **HD 1080P** vs **Sub-stream Fluido** |
| **🔵 Tecla Azul** | **Abre / Fecha o Modal de Configurações** (IP, Senha e Portas) |
| **⚙️ Ícone no Topo** | Clique ou navegue com a seta para cima para abrir Configurações |
| **CH ▲ / CH ▼** | Próxima câmera / Câmera anterior diretamente em tela cheia |
| **Teclas 0 a 9** | Atalho numérico direto para selecionar o canal desejado |

---

## ⚙️ Modal de Configurações no App

Pressionando a **Tecla Azul** no controle ou clicando no botão **⚙️ Configurações** no topo direito:
1. **Endereço IP:** Altere o IP do seu DVR (ex: `192.168.100.2`).
2. **Usuário:** Nome de usuário (ex: `admin`).
3. **Senha:** Campo protegido internamente. Por segurança, a senha configurada **não é exibida na tela** (para manter a senha salva, basta deixar o campo em branco). Digite apenas caso deseje alterá-la.
4. **Configurações Avançadas (Expansível):**
   - Porta HTTP / Web (Padrão: `80`).
   - Porta RTSP (Padrão: `554`).
5. **Ações:**
   - **💾 Salvar e Reconectar:** Grava no `localStorage` permanente da TV e reconecta imediatamente.
   - **🔄 Restaurar Padrões:** Redefine para as configurações de fábrica (`192.168.100.2`, `admin`, `jr130182`, portas 80 e 554).
   - **✖ Cancelar / Fechar:** Fecha sem salvar alterações.
