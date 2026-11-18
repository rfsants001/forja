# Design: Coach AI Provider

## Estado da implementação

- Ollama continua padrão. Codex CLI é opt-in com `FORJA_COACH_PROVIDER=codex-cli`. O CLI oficial verifica o login ChatGPT no perfil privado da instalação. O diretório dedicado fica gravável dentro do Bubblewrap para a renovação do login pelo CLI. Configuração do usuário, histórico, shell, busca e plugins ficam desabilitados na geração.
- `POST /coach/plans` aceita objetivo, foco, tempo e candidatos da biblioteca. O servidor valida IDs, limites e duplicatas. O Assistente mostra a prévia e grava a rotina no Dexie apenas após confirmação, usando a fila de sync existente.
- Claude Code por assinatura fica pendente. A integração de produtos de terceiros com as credenciais de assinatura é limitada pela [política de autenticação da Anthropic](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use).
- O [README](../../../README.md#montar-um-treino-com-codex-por-assinatura) descreve a instalação e o probe.

## Proposta original

## Architecture

```
index.mjs
  └─ resolveProvider(env)            ← escolhe o provedor por FORJA_COACH_PROVIDER
        ├─ ollamaProvider(url)       ← HTTP (default)
        ├─ codexCliProvider(cfg)     ← CLI sandboxed
        └─ claudeCliProvider(cfg)    ← CLI sandboxed
  └─ createCoach(provider)           ← orquestração agnóstica
        ├─ providers()  → provider.listModels()
        ├─ review(body) → monta prompt + provider.generate() + valida schema
        └─ test(body)   → provider.generate() trivial
```

O coach deixa de conhecer Ollama. Ele só sabe: montar o system prompt, chamar `provider.generate(model, system, input, signal)`, validar o resultado contra o `schema` (summary + ≤3 `replaceExercise` casando com candidatas) e aplicar o mutex single-flight + asserts (`PROVIDER_BUSY`, `MODEL_UNAVAILABLE` quando `model` não está em `listModels().models`).

## Interface do provedor

```
Provider = {
  id: string,                 // 'ollama' | 'codex-cli' | 'claude-cli'
  kind: 'http' | 'cli',
  listModels(signal): Promise<{ destination: string, models: string[], available: boolean }>,
  generate(model, system, input, signal): Promise<object>,  // JSON já parseado
}
```

`generate` resolve com o objeto parseado (o coach valida forma). Erros → `ApiError` com os códigos existentes. O coach nunca vê detalhe de transporte.

## Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Orquestração do coach | `apps/server/src/coach.mjs` (refactor) | `reviewInput`, system prompt, `review`/`test`, validação do schema, mutex, mapeamento de erros. Recebe um `provider`. |
| Resolução de provedor | `apps/server/src/providers/index.mjs` (novo) | `resolveProvider(env)` → instancia o provedor conforme `FORJA_COACH_PROVIDER`. |
| Provedor Ollama | `apps/server/src/providers/ollama.mjs` (novo) | Move o `request`/`providers`/`generate` HTTP atuais de `coach.mjs` sem mudança observável. |
| Provedor Codex CLI | `apps/server/src/providers/codex-cli.mjs` (novo) | `generate` via `codex exec --output-schema`; `listModels` por presença de binário/credenciais. |
| Provedor Claude CLI | `apps/server/src/providers/claude-cli.mjs` (novo) | `generate` via `claude -p --output-format json`; prompt pede JSON do schema; `listModels` idem. |
| Sandbox helper | `apps/server/src/providers/sandbox-run.mjs` (novo) | Extrai o padrão Bubblewrap de `codex-probe.mjs`: cria tmp efêmero, copia credenciais ro, monta binds, roda, lê saída, limpa. |
| Probe (ajuste) | `apps/server/src/codex-probe.mjs` | Passa a usar `sandbox-run.mjs` (sem duplicar o bwrap). |
| Wiring | `apps/server/src/index.mjs` | `const coach = createCoach(resolveProvider(process.env))`. Remove o default hardcoded de URL para dentro do provedor Ollama. |

## Data Flow

1. `POST /coach/reviews` → `coach.review(body, signal)`.
2. `review` valida o input agregado (`reviewInput`), monta o system prompt (idioma por `body.lang`) e chama `provider.generate(body.model, system, input, signal)`.
3. **http**: POST para `/api/chat` do Ollama com `format: schema`. **cli**: `sandbox-run` escreve `input`/`schema`/prompt em tmp, spawna o CLI, lê o JSON da última mensagem.
4. `review` valida o resultado contra o schema e filtra sugestões para casarem exatamente com as candidatas fornecidas.
5. Resposta no mesmo formato de hoje (`{ summary, suggestions }`).

## CLI providers — detalhe

- **Sandbox** (de `codex-probe.mjs`): `bwrap --unshare-all --share-net --die-with-parent --clearenv`, binds ro de `/usr`,`/lib*`,`/etc/ssl`,`resolv.conf`,`hosts`,`ca-certificates`; `--proc`,`--dev`,`--tmpfs /tmp`; `--bind <work> /probe`; binário ro; `HOME`/config apontando para `/probe` com as credenciais copiadas; `--chdir /probe`; timeout 90 s; `maxBuffer` 512 KB.
- **Codex**: `codex -a never exec --sandbox read-only --ignore-user-config --ephemeral --skip-git-repo-check --output-schema schema.json --output-last-message response.json "<prompt+input>"`. Schema = `schema` do coach. Lê `response.json`.
- **Claude**: `claude -p "<prompt que embute o schema + input JSON>" --output-format json` com o diretório de credenciais no sandbox. Lê o envelope, extrai o texto do resultado, `JSON.parse`. (flags exatas → OQ-001.)
- **Disponibilidade** (`listModels`): `available` só se `process.platform === 'linux'`, `bwrap` presente, binário existe e credenciais existem; senão `{ destination, models: [], available: false }` — e a tela do Assistente cai no passo de setup, como já faz quando não há Ollama.

## Dependencies

- Reaproveita: Bubblewrap (já requerido pelo probe), `ApiError`/`assert` de `storage.mjs`, o `schema` e a validação já existentes no `coach.mjs`.
- Toca: `index.mjs` (1 linha de wiring + env), `coach.mjs` (refactor para receber provider), `codex-probe.mjs` (usar helper), README/handoff (doc do provedor e do ToS).
- Não adiciona dependência npm nova.

## Risks

- **Flags do CLI mudam entre versões** (OQ-001): isolar a montagem do comando em cada provedor; validação do coach é a rede de segurança.
- **Latência/single-flight**: CLI por request é lento; o mutex já serializa. Deixar claro no UI que é 1 por vez.
- **Credenciais**: nunca logar stderr/stdout crus do CLI; só mapear para código de erro.

## Interface e configuração atuais

A tela Perfil → Conexões de IA lista os provedores e grava a seleção no SQLite da instalação. Ollama detecta o serviço local. Codex inicia o login oficial do CLI em perfil dedicado e apresenta apenas o link da OpenAI e, na opção remota, o código de dispositivo. Os comandos locais `npm run dev` e `npm start` servem a API na mesma origem do navegador. O fluxo local da IA é separado do sync. Na instalação remota, a geração exige uma sessão autorizada e a configuração exige o dono. O descanso por exercício vem da geração.

## Contexto e programação do treino

O assistente lê referência local, CSV de Hevy/Strong/FitNotes e JSON de backup/plano da Forja no navegador. O usuário escolhe uma sessão ou rotina. A rota de montagem recebe um recorte de até 16 exercícios com séries, reps e carga registrada conforme disponibilidade. Rótulos da sessão, nomes de arquivo e notas ficam fora do pedido. Nada é gravado ao anexar a referência.

Os princípios de progressão, volume, ordem e especificidade seguem a [posição ACSM 2026](https://acsm.org/resistance-training-guidelines-update-2026/). Os intervalos de reps e descanso e o estimador de tempo são regras de programação da Forja. A IA escolhe entre IDs elegíveis. A API ajusta séries à duração estimada, prioriza compostos em força e complementa superiores/inferiores quando o foco é corpo inteiro e a lista permite. Em casa, os candidatos passam pelo inventário. Na academia, as alternativas requerem mesma família de movimento e outra resistência, verificadas na biblioteca. A rotina salva mantém as substituições nas notas.
