# Spec: Coach AI Provider (abstração + CLI por assinatura)

## Estado da implementação

- Ollama continua padrão. Codex CLI é opt-in com `FORJA_COACH_PROVIDER=codex-cli`. O CLI oficial verifica o login ChatGPT no perfil privado da instalação. O diretório dedicado fica gravável dentro do Bubblewrap para a renovação do login pelo CLI. Configuração do usuário, histórico, shell, busca e plugins ficam desabilitados na geração.
- `POST /coach/plans` aceita objetivo, foco, tempo e candidatos da biblioteca. O servidor valida IDs, limites e duplicatas. O Assistente mostra a prévia e grava a rotina no Dexie apenas após confirmação, usando a fila de sync existente.
- Claude Code por assinatura fica pendente. A integração de produtos de terceiros com as credenciais de assinatura é limitada pela [política de autenticação da Anthropic](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use).
- O [README](../../../README.md#montar-um-treino-com-codex-por-assinatura) descreve a instalação e o probe.

## Proposta original

## Summary

Hoje o Assistente de treino (`apps/server/src/coach.mjs`) só fala a API HTTP do Ollama. Este trabalho **abstrai o provedor de IA** atrás de uma interface e adiciona provedores "por assinatura via CLI sandboxed" no modelo do Gatewright: o servidor dirige um CLI local já autenticado (`claude`, `codex`) em vez de pagar por token numa API. A orquestração do coach (montagem do prompt, validação da saída contra o schema JSON) permanece única; só a geração bruta e a listagem de modelos passam a ser responsabilidade do provedor selecionado. O provedor Ollama HTTP continua sendo o padrão. O mecanismo de sandbox reaproveita o padrão já provado em `apps/server/src/codex-probe.mjs` (login dedicado + Bubblewrap).

## Requirements

### Functional

- [FN-001] Definir uma interface de provedor com, no mínimo: `id`, `kind`, `listModels(signal)` → `{ destination, models, available }`, e `generate(model, system, input, signal)` → objeto já parseado (mesmo contrato que o `generate` atual do coach espera).
- [FN-002] `createCoach` deixa de receber um endpoint e passa a receber (ou resolver) um provedor. A orquestração existente — `reviewInput`, system prompt de `review`, `test`, e a validação do resultado (summary ≤ 2500, ≤ 3 `replaceExercise`, candidata idêntica a uma fornecida) — permanece no coach, agnóstica de provedor.
- [FN-003] Provedor `ollama-http`: comportamento atual extraído sem mudança observável (`/api/tags`, `/api/chat` com `format` = schema, `options`, streaming lido com teto de 512 KB). Continua sendo o **default**.
- [FN-004] Provedor `codex-cli`: gera via `codex exec` sandboxed (Bubblewrap), com `--output-schema` apontando para o schema do coach e `--output-last-message` para ler o JSON. Reaproveita o padrão de `codex-probe.mjs` (copiar `auth.json` do home dedicado, `--sandbox read-only`, `--ignore-user-config`, `--ephemeral`).
- [FN-005] Provedor `claude-cli`: gera via CLI do Claude Code em modo não interativo (`claude -p … --output-format json`), sandboxed do mesmo jeito, usando o diretório de credenciais da assinatura dedicada. Como o CLI do Claude não garante schema nativamente, o prompt exige JSON conforme o schema e a validação do coach rejeita saída inválida (`INVALID_PROVIDER_RESPONSE`).
- [FN-006] Seleção de provedor por configuração: `FORJA_COACH_PROVIDER = ollama | codex-cli | claude-cli` (default `ollama`). Cada provedor CLI lê suas próprias variáveis de binário e home de credenciais, espelhando `FORJA_CODEX_HOME`/`FORJA_CODEX_BINARY` (ex.: `FORJA_CLAUDE_HOME`/`FORJA_CLAUDE_BINARY`).
- [FN-007] `listModels` dos provedores CLI reporta `available: true` só quando o binário e as credenciais estão presentes e o host suporta o sandbox (Linux + `bwrap`); `models` reflete o(s) modelo(s) configurável(is) daquele CLI. O `/coach/providers` continua respondendo no mesmo formato que a tela do Assistente já consome.
- [FN-008] As três rotas (`GET /coach/providers`, `POST /coach/test`, `POST /coach/reviews`) permanecem com o mesmo contrato de request/response; a troca de provedor é transparente para o frontend.

### Non-Functional

- [NF-001] **Single-flight preservado:** mutex `running` do coach continua garantindo uma geração por vez (CLI é mais pesado que HTTP).
- [NF-002] **Timeout e tamanho limitados:** cada geração respeita um teto de tempo (alinhado aos 55 s atuais / 90 s do probe) e de bytes lidos, abortável pelo `signal` da requisição.
- [NF-003] **Isolamento:** provedores CLI rodam sob Bubblewrap com `--unshare-all --share-net`, `--clearenv`, tmp efêmero, binário e credenciais somente-leitura; nenhuma credencial é logada.
- [NF-004] **Sem regressão:** `pnpm test` (138 core + 2 server), `pnpm typecheck` e `pnpm build` continuam verdes; o teste de instalação do server cobre o caminho Ollama default.
- [NF-005] **Paridade de erros:** falhas mapeiam para os códigos já usados (`PROVIDER_UNAVAILABLE`, `MODEL_UNAVAILABLE`, `PROVIDER_BUSY`, `INVALID_PROVIDER_RESPONSE`, `INVALID_PROVIDER_RESPONSE`), sem vazar stderr do CLI.

## Out of Scope

- Provedores por **API key** paga (Anthropic Messages, OpenAI). A interface deve deixar a porta aberta, mas nenhum provedor key-based é implementado aqui.
- **Multiusuário / SaaS** servindo vários usuários por uma só assinatura — fora do escopo e fora da política de uso das plataformas (ver restrição abaixo).
- Transformar o coach em **agente** (uso de ferramentas, leitura de arquivos). O coach continua um gerador de JSON sobre dados agregados.
- UI nova no Assistente além do que o contrato atual de `/coach/providers` já alimenta (um rótulo informando o provedor ativo é desejável, mas opcional).

## Restrição de produto

Alvo **self-hosted single-user**: cada dono roda a própria assinatura, na própria instalação. Isso mantém o uso dentro do ToS de Claude Code / Codex (equivalente a usar o CLI manualmente). Rodar uma assinatura para servir terceiros é explicitamente não-suportado e deve ser documentado como tal no README/handoff.

## Open Questions

- [OQ-001] Flags exatas e formato de saída do `claude -p` na versão alvo (envelope `{ result }` vs. texto puro; flag de diretório de credenciais — `CLAUDE_CONFIG_DIR`/`HOME`). Verificar no binário real antes de fixar em código.
- [OQ-002] Conceito de "modelo" para os provedores CLI: lista fixa configurável (ex.: um `FORJA_*_MODEL`) vs. descoberta. Provável: valor único configurável exibido no seletor.
- [OQ-003] O sandbox precisa de acesso ao catálogo de exercícios? Não — o input de review já chega agregado e auto-contido; o CLI só recebe system + JSON. Confirmar que nenhum provedor precisa de rede além do destino da API de inferência (Claude/Codex) ou de nada (modelo local).
- [OQ-004] Reaproveitar `codex-probe.mjs` como provedor ou mantê-lo como prova e extrair um helper comum de sandbox. Preferência: extrair `sandbox-run.mjs` e o probe passa a usá-lo.
