---
name: security-audit
description: Security guidance and vulnerability review for codebases, APIs, services, CLI tools, libraries, and daemons based on the Cloudflare Security Audit methodology.
---

# Security Audit (Cloudflare Methodology)

This workspace skill provides security review, vulnerability assessment, and defensive remediation guidance for the DVR Smart TV application and backend proxy.

For full guidelines, checklists, and attack class definitions, refer to the local skill repository:
- Main Skill: [.ai/skills/security-audit-skill/skills/security-audit/SKILL.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/skills/security-audit/SKILL.md)
- Attack Classes: [.ai/skills/security-audit-skill/skills/security-audit/ATTACK-CLASSES.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/skills/security-audit/ATTACK-CLASSES.md)
- Client-Side & DOM: [.ai/skills/security-audit-skill/skills/security-audit/CLIENT-SIDE.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/skills/security-audit/CLIENT-SIDE.md)
- Web Protocol & Auth: [.ai/skills/security-audit-skill/skills/security-audit/WEB-PROTOCOL-AND-AUTH.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/skills/security-audit/WEB-PROTOCOL-AND-AUTH.md)
- Validation & Reporting: [.ai/skills/security-audit-skill/skills/security-audit/VALIDATION-AND-REPORTING.md](file:///c:/Users/jeova/.gemini/antigravity-ide/brain/dvrtvlg/.ai/skills/security-audit-skill/skills/security-audit/VALIDATION-AND-REPORTING.md)

## Universal Rules
1. **Source-First Defensive Review**: Every finding must be linked to concrete source code evidence.
2. **Safe Verification**: Do not generate offensive weaponized exploits or exfiltration tools.
3. **Structured Reporting**: Output findings with severity, impact, root-cause code location, and remediation plan.
