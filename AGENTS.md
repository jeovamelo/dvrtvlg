# Regras do Projeto DVR TV (LG webOS & Samsung Tizen)

## Diretrizes Gerais de Desenvolvimento
- Este repositório contém a aplicação Smart TV para visualização de câmeras de segurança DVR Hikvision / Intelbras via ISAPI e RTSP/HLS.
- O projeto possui dois alvos principais:
  - **LG Smart TV (webOS)**: Pacote `.ipk` configurado via `appinfo.json`.
  - **Samsung Smart TV (Tizen)**: Pacote `.wgt` configurado via `config.xml`.
  - **Servidor Proxy Local**: `server.js` (Node.js) para contornar restrições de CORS e autenticar no DVR.

## Auditoria de Segurança
- As revisões de código, novos módulos e modificações na comunicação de rede devem seguir obrigatoriamente as diretrizes de segurança do Cloudflare Security Audit Skill:
  - Regra ativa: [.agents/rules/security-audit.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.agents/rules/security-audit.md)
  - Repositório local da skill: [.ai/skills/security-audit-skill/](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/)
- Todas as alterações que tocam em autenticação, proxy HTTP, manipulação de DOM (`innerHTML`), manipulação de credenciais (`localStorage`) ou privilégios de TV devem ser auditadas defensivamente antes da publicação.
