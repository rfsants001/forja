# AI Coach · hipótese futura

Estado: planejado, sem implementação. Depende do piloto PT-BR e de confirmar que a revisão determinística é insuficiente.

1. Começar com revisão local baseada em regras: aderência, estagnações, histórico de esforço e sugestões editáveis.
2. Se houver valor em IA, considerar intake curto sobre objetivo, equipamento e agenda. Mostrar os dados mínimos que sairão do dispositivo antes de qualquer uso de um provider externo.
3. Exibir cada proposta com efeito e justificativa. Exigir confirmação por alteração. Salvar snapshot em transação, identificar alterações concorrentes e permitir desfazer.
4. Manter a prescrição diária no motor determinístico. Restringir as propostas a tipos e exercícios validados do catálogo.

O Claude Agent SDK depende de processo Claude Code, e o Codex CLI depende de runtime fora da PWA. A arquitetura de provider está em aberto. Credenciais permanentes no localStorage não fazem parte da proposta. [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript) · [Coach de referência](https://github.com/alexpcosta/opengym)
