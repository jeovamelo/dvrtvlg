# Diretrizes de Auditoria de Segurança (Security Audit Skill - Cloudflare)

Este projeto integra formalmente a metodologia e as diretrizes do **Cloudflare Security Audit Skill** (`.ai/skills/security-audit-skill/`).

## Metodologia de 6 Fases para Revisão de Segurança

Sempre que realizar revisões de código, auditorias de segurança, validação de dependências ou análise de arquitetura neste repositório, o agente deve seguir o fluxo defensivo baseado em evidências:

1. **Reconhecimento (Reconnaissance)**:
   - Mapear a superfície de ataque, limites de confiança (trust boundaries), componentes clientes (Smart TVs Tizen/webOS) e componentes backend/proxy (Node.js/HTTP).
   - Identificar pontos de entrada não autenticados, armazenamento local e canais de comunicação com o DVR/NVR.

2. **Varredura e Mapeamento de Cobertura (Coverage-Led Hunting)**:
   - Cobrir classes de ataque essenciais:
     - **Client-Side & DOM Injection**: Sinks perigosos (`innerHTML`, `eval`, `document.write`), injeção de dados originados de APIs externas/DVR sem escape HTML.
     - **Web Protocol & Auth / SSRF**: Validação de URLs, proxies reversos que aceitam cabeçalhos ou parâmetros para redirecionar tráfego interno (`X-DVR-Target`, `X-DVR-Host`), bypass de autenticação.
     - **Data Isolation & Credential Storage**: Credenciais, senhas e tokens salvos em texto claro em `localStorage`, cookies ou logs.
     - **Appliance & Smart TV Permissions**: Manifests (`appinfo.json`, `config.xml`), Content Security Policy (CSP), privilégios webOS/Tizen.
     - **Resource Exhaustion & Denial of Service**: Conexões persistentes sem timeout, buffers de stream sem controle de vazamento de memória.

3. **Validação de Candidatos (Candidate Validation)**:
   - Exigir causa raiz exata e evidência direta no código (arquivo e número de linha).
   - Não reportar falsos positivos teóricos ou "higiene de código" sem impacto real na segurança.
   - Definir impacto concreto, principal afetado e pré-condições necessárias para exploração.

4. **Saída Estruturada e Relatório Neutro**:
   - Classificação objetiva de severidade (CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL).
   - Descrição detalhada do mecanismo da vulnerabilidade e cenário de risco.
   - Fornecer recomendação defensiva com o menor patch corretivo eficaz.

5. **Isolamento e Segurança de Execução**:
   - Todo teste e análise é estritamente defensivo e estático/local.
   - Não gerar payloads ofensivos, scripts de ataque funcionais ou ferramentas de exfiltração.
   - Execuções locais restritas a ambientes sandbox e sem acesso à rede externa não autorizada.

## Referência Completa
A documentação detalhada dos vetores de ataque e procedimentos encontra-se em:
- [SKILL.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/skills/security-audit/SKILL.md)
- [CLIENT-SIDE.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/skills/security-audit/CLIENT-SIDE.md)
- [WEB-PROTOCOL-AND-AUTH.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/skills/security-audit/WEB-PROTOCOL-AND-AUTH.md)
- [ATTACK-CLASSES.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/skills/security-audit/ATTACK-CLASSES.md)
