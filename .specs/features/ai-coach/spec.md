# AI Coach · hipótese futura

Hipótese original, mantida como referência. O [pacote self-hosted](../self-hosted-assistant/README.md) detalha o piloto, com revisão determinística antes da etapa Ollama. Para implementação, comece pelo novo pacote.

1. Começar com revisão local baseada em regras: aderência, estagnações, histórico de esforço e sugestões editáveis.
2. Se houver valor em IA, considerar intake curto sobre objetivo, equipamento e agenda. Mostrar os dados mínimos que sairão do dispositivo antes de qualquer uso de um provider externo.
3. Exibir cada proposta com efeito e justificativa. Exigir confirmação por alteração. Salvar snapshot em transação, identificar alterações concorrentes e permitir desfazer.
4. Manter a prescrição diária no motor determinístico. Restringir as propostas a tipos e exercícios validados do catálogo.

O Claude Agent SDK depende de processo Claude Code, e o Codex CLI depende de runtime fora da PWA. A arquitetura de provider está em aberto. Credenciais permanentes no localStorage não fazem parte da proposta. [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript) · [Coach de referência](https://github.com/alexpcosta/opengym)
