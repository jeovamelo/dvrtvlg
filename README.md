# 📹 DVR TV - Aplicativo para LG Smart TV (webOS) e Samsung Smart TV

Aplicativo nativo para **LG Smart TV (webOS)** e **Samsung Smart TV (Tizen)** projetado para monitoramento em tempo real das câmeras do DVR Hikvision com layout em grade 4x4 (16 câmeras simultâneas), visualização em tela cheia e painel interativo de configurações na tela.

---

## 🔍 Informações do Sistema DVR

- **Dispositivo:** DVR Hikvision AcuSense Turbo HD
- **Modelo:** iDS-7216HQHI-M1/XT
- **Nome do Dispositivo:** DVR01Casa
- **Total de Canais:** 16 canais de vídeo
  - **Câmeras com sinal (1080P):** Câmeras 01 a 06, 09, 11 a 16 (13 ativas).
  - **Canais sem sinal:** Câmeras 07, 08 e 10.
- **Portas:**
  - HTTP: 80 (configurável pelo modal do app)
  - RTSP: 554 (configurável pelo modal do app)
- **Autenticação:** ISAPI com desafio criptográfico SHA-256 e sessão contínua.

---

## 🏗️ Estrutura do Projeto

```text
├── appinfo.json             # Manifesto oficial LG webOS TV
├── com.dvr.tv_1.0.0_all.ipk # Pacote compilado oficial para LG webOS TV
├── config.xml               # Manifesto de compatibilidade Samsung Tizen
├── dvrtv.wgt                # Pacote compilado para Samsung Tizen
├── icon.png                 # Ícone da aplicação (80x80)
├── largeIcon.png            # Ícone expandido para webOS
├── index.html               # Interface gráfica 1080p nativa com Modal de Configurações
├── css/
│   └── style.css            # Estilos escuros de alto contraste e bordas luminosas
├── js/
│   ├── sha256.js            # Hash SHA-256 para autenticação no DVR
│   ├── dvr-api.js           # Cliente ISAPI dinâmico (suporta IP e portas customizadas)
│   ├── avplayer.js          # Player de vídeo para LG webOS e Samsung (HTML5 / AVPlay / Snapshot)
│   ├── remote-keys.js       # Gerenciador de teclas para controle LG (webOS 461), Samsung e PC
│   └── app.js               # Lógica do app, controle da grade 4x4, foco e modal de configurações
├── server.js                # Servidor proxy dinâmico para testes no PC e navegadores
├── build-package.bat        # Script para empacotar o arquivo .ipk (LG) e .wgt (Samsung)
├── start-server.bat         # Inicia o servidor local para teste imediato
├── COMO_INSTALAR_LG_TV.md   # Guia detalhado passo a passo para LG webOS TV
├── COMO_INSTALAR_SAMSUNG_TV.md # Guia para Samsung Smart TV
└── README.md                # Documentação geral
```

---

## ✨ Novos Recursos e Funcionalidades

1. **Suporte Nativo LG Smart TV (webOS):**
   - Empacotamento em formato `.ipk` (`com.dvr.tv_1.0.0_all.ipk`).
   - Mapeamento da tecla **Voltar do controle LG (Keycode 461)** e suporte total ao cursor do **Magic Remote**.
2. **Modal Interativo de Configurações na Tela:**
   - Abertura direta pela **Tecla Azul** no controle ou pelo ícone **⚙️ Configurações** no cabeçalho.
   - Campos: **IP do DVR**, **Usuário** e **Senha** com botão **👁️ Exibir/Ocultar Senha**.
   - Seção **Configurações Avançadas** expansível (Accordion) para ajustar **Porta HTTP** e **Porta RTSP**.
   - Botões de ação: **💾 Salvar e Reconectar**, **🔄 Restaurar Padrões** e **✖ Cancelar / Fechar**.
   - Destaque luminoso azul (`#00d2ff`) ao navegar pelos campos com as setas do controle.
   - Abertura automática do teclado virtual nativo da TV ao pressionar OK/Enter em qualquer campo.
3. **Persistência Permanente (`localStorage`):**
   - As configurações ficam salvas na memória da TV mesmo após desligar da tomada.
4. **Proxy Dinâmico no PC (`server.js`):**
   - Aceita conexões redirecionadas para qualquer IP/porta dinâmicos configurados no navegador do PC.
5. **Grade 4x4 Simultânea (16 Câmeras):**
   - Exibição de todas as 16 câmeras ao mesmo tempo com atualização periódica dos snapshots.
6. **Tela Cheia em Alta Resolução:**
   - Selecione qualquer câmera e pressione OK para assistir em tela cheia.
