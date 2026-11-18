# Tasks: Coach AI Provider

## Entrega e retomada

O adaptador Ollama, o Codex CLI, o sandbox compartilhado e a seleção do provedor por variável estão implementados. O Assistente ganhou o fluxo de montagem de treino e grava a rotina depois da confirmação. O Claude Code por assinatura fica pendente conforme a política do provedor.

A geração e o salvamento passaram em viewport móvel com um binário simulado dentro do Bubblewrap. Os testes de servidor cobrem seleção, login ausente ou incorreto, JSON inválido e exercícios fora da lista ou duplicados. O teste de instalação também exerce Ollama. A inferência com o login ChatGPT dedicado do dono precisa ser validada no host.

## Roteiro original

Ordem pensada para manter a suíte verde a cada passo. Cada tarefa = 1 commit atômico. O default (Ollama) nunca pode quebrar.

---

## T1 — Extrair o provedor Ollama sem mudança de comportamento

**Depende de:** —
**Arquivos:** `apps/server/src/providers/ollama.mjs` (novo), `apps/server/src/coach.mjs`, `apps/server/src/index.mjs`

- Mover `request`, `providers` e o `generate` HTTP de `coach.mjs` para `ollamaProvider(endpoint)` em `providers/ollama.mjs`, expondo `{ id: 'ollama', kind: 'http', listModels, generate }` (renomear `providers` → `listModels`).
- `createCoach` passa a receber `provider` e chamar `provider.listModels`/`provider.generate`; mantém `reviewInput`, system prompt, `review`, `test`, validação e mutex.
- `index.mjs`: `createCoach(ollamaProvider(process.env.FORJA_OLLAMA_URL ?? 'http://127.0.0.1:11434'))`.

**Done when:**
- [ ] `pnpm --filter @forja/server test` passa (installation.test cobre o caminho Ollama).
- [ ] `pnpm typecheck` e `pnpm build` verdes.
- [ ] `GET /coach/providers`, `POST /coach/test`, `POST /coach/reviews` respondem no mesmo formato de antes (diff só move código).

**Commit:** `refactor(server): extract ollama coach provider behind an interface`

---

## T2 — Helper de sandbox compartilhado

**Depende de:** —
**Arquivos:** `apps/server/src/providers/sandbox-run.mjs` (novo), `apps/server/src/codex-probe.mjs`

- Extrair de `codex-probe.mjs` um `sandboxRun({ binary, home, files, argv, timeout })` que cria o tmp efêmero, copia credenciais ro, monta os binds Bubblewrap, roda e devolve o conteúdo dos arquivos de saída pedidos; limpa o tmp no `finally`.
- `codex-probe.mjs` passa a chamar o helper (comportamento idêntico; segue como prova via `pnpm self-host:codex-probe`).

**Done when:**
- [ ] `codex-probe.mjs` não duplica mais o `bwrap`; a prova sintética continua funcionando quando `FORJA_CODEX_HOME`/`FORJA_CODEX_BINARY` estão setados.
- [ ] Sem binds novos além dos já usados pelo probe; nada logado de credencial.
- [ ] `pnpm typecheck`/`build` verdes.

**Commit:** `refactor(server): extract bubblewrap sandbox runner from codex probe`

---

## T3 — Provedor Codex CLI

**Depende de:** T1, T2
**Arquivos:** `apps/server/src/providers/codex-cli.mjs` (novo)

- `codexCliProvider({ binary, home, model })` com `kind: 'cli'`:
  - `generate(model, system, input, signal)`: via `sandboxRun`, escreve `schema.json` (o schema do coach) e o prompt (`system` + input JSON), roda `codex -a never exec --sandbox read-only --ignore-user-config --ephemeral --skip-git-repo-check --output-schema … --output-last-message …`, lê e `JSON.parse` a última mensagem.
  - `listModels(signal)`: `available` só com Linux + `bwrap` + binário + `auth.json`; `models` = `[model]` configurado; senão `{ models: [], available: false }`.
- Exportar o `schema` do coach (ou passá-lo ao provider) para alimentar `--output-schema`.

**Done when:**
- [ ] Erros mapeiam para `PROVIDER_UNAVAILABLE`/`INVALID_PROVIDER_RESPONSE`; stderr do CLI nunca propaga cru.
- [ ] Teste de unidade com binário falso (stub de `execFile`) cobrindo saída válida, inválida e indisponível.
- [ ] `pnpm typecheck`/`build` verdes.

**Commit:** `feat(server): add sandboxed codex CLI coach provider`

---

## T4 — Provedor Claude CLI (modelo assinatura, Gatewright)

**Depende de:** T1, T2
**Arquivos:** `apps/server/src/providers/claude-cli.mjs` (novo)

- `claudeCliProvider({ binary, home, model })` com `kind: 'cli'`:
  - `generate`: via `sandboxRun`, monta prompt que embute o schema + o input JSON e exige "responda só com JSON válido"; roda `claude -p … --output-format json` com o diretório de credenciais no sandbox; extrai o texto do resultado e `JSON.parse`. (confirmar flags — OQ-001).
  - `listModels`: mesma regra de disponibilidade do T3; `models` = `[model]`.
- Validação de schema fica no coach (rejeita JSON fora de forma com `INVALID_PROVIDER_RESPONSE`).

**Done when:**
- [ ] Teste de unidade com binário falso (válido / texto-não-JSON / indisponível).
- [ ] Nenhuma credencial em log; timeout e `maxBuffer` aplicados.
- [ ] `pnpm typecheck`/`build` verdes.

**Commit:** `feat(server): add sandboxed claude code coach provider (subscription)`

---

## T5 — Resolução por configuração

**Depende de:** T1, T3, T4
**Arquivos:** `apps/server/src/providers/index.mjs` (novo), `apps/server/src/index.mjs`

- `resolveProvider(env)`: lê `FORJA_COACH_PROVIDER` (default `ollama`) e instancia o provedor com suas variáveis (`FORJA_OLLAMA_URL`; `FORJA_CODEX_BINARY`/`FORJA_CODEX_HOME`/`FORJA_CODEX_MODEL`; `FORJA_CLAUDE_BINARY`/`FORJA_CLAUDE_HOME`/`FORJA_CLAUDE_MODEL`).
- `index.mjs`: `createCoach(resolveProvider(process.env))`.
- Valor desconhecido de `FORJA_COACH_PROVIDER` → erro claro na subida.

**Done when:**
- [ ] Sem env, o comportamento é idêntico ao de hoje (Ollama default).
- [ ] Teste cobrindo a seleção de cada provedor e o valor inválido.
- [ ] `pnpm test`/`typecheck`/`build` verdes.

**Commit:** `feat(server): select coach provider via FORJA_COACH_PROVIDER`

---

## T6 — Documentação e handoff

**Depende de:** T5
**Arquivos:** `README.md`, `.specs/features/self-hosted-assistant/IMPLEMENTACAO.md`, `.specs/project/STATE.md`, `.specs/project/ROADMAP.md`

- README: seção do Assistente ganha as variáveis de provedor e um aviso de ToS (single-user, assinatura do próprio dono; não servir terceiros).
- Handoff: registrar o que foi validado (Ollama, probes CLI) e o que falta (geração real ponta-a-ponta com `claude`/`codex` logados no host).
- STATE/ROADMAP: marcar o provider abstrato como entregue e as checagens CLI reais como pendentes de host.

**Done when:**
- [ ] README documenta `FORJA_COACH_PROVIDER` e as variáveis de cada CLI + restrição de ToS.
- [ ] STATE lista as validações pendentes (geração real via CLI logado).

**Commit:** `docs: document coach provider selection and subscription CLI setup`

---

## Verificação final (não é tarefa de código)

- [ ] Smoke no host com Ollama (default) — sem regressão.
- [ ] `codex-cli` ponta-a-ponta com login dedicado + Bubblewrap (estende a prova atual do probe para uma review real).
- [ ] `claude-cli` ponta-a-ponta com assinatura dedicada (confirmar flags do `claude -p`).
- [ ] Confirmar no Assistente que o passo de setup aparece quando o provedor CLI não está disponível.
