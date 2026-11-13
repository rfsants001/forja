# Reference — openGym (estudo do repo real)

> Fonte: `https://github.com/alexpcosta/opengym` (fork de `DuarteSantos8/openGym` que
> acrescenta o **AI Coach**). Clonado e estudado em **2026-11-11**. openGym é **AGPL-3.0** —
> aqui só estudamos conceito/arquitetura/UX; **nenhum código AGPL entra no Forja**.

## O que é
Tracker de treino + peso corporal **self-hosted**, "dono dos seus dados". Mesma tese do Forja.
Diferença-chave de arquitetura: openGym tem **backend** (Node + WebAuthn + arquivos JSON em
`./data`), multi-user com **passkeys** e **sync** entre dispositivos; o Forja pivotou para
**100% local-first no browser (Dexie), sem backend**.

## Arquitetura (deles)
```
phone/laptop ──HTTPS──▶ web (nginx: serve app + proxy /api) ──▶ api (Node + WebAuthn)
                                                                     └─ ./data/*.json
```
- **frontend/** — React 19 + Vite, **React Router + Zustand**, lógica pura em `src/lib/` com
  testes Vitest ao lado. Sem deps de runtime além de React/router/zustand. **JavaScript (.jsx)**, não TS.
- **api/** — Node sem framework, 1 dependência (`@simplewebauthn/server`); persiste JSON puro
  em `./data` (`db.json` = perfis + passkeys públicas; `state-<user>.json` = plano/workouts/peso/
  settings; `secret` = chave do cookie). O fork acrescenta `api/coach/` (o AI Coach, adapters claude/codex).
- **web/** — imagem multi-stage (build do front + nginx proxy `/api`) → single origin (passkey exige).
- **Capacitor** — o MESMO código vira **APK Android standalone** (sem conta/servidor, dado no
  aparelho, lembretes nativos). iOS só via PWA/Xcode.
- Dados dos exercícios: **`hasaneyldrm/exercises-dataset`** (1.324 exercícios, imagens 180×180 +
  GIFs, servidos de CDN jsDelivr).

## Mapa de telas (frontend/src/views)
Home · Workout (treino guiado) · Plan (plano semanal) · RoutineEdit · Library · History · Stats ·
Settings · Login · Admin · Coach · CoachIntake · CoachProposal · AdminCoach.
Componentes: TabBar, RestTimer, Stepper, NumField, Media (demos), LineChart, Heatmap, **BodyMap**
(mapa muscular male/female), Modals, Toast, ErrorBoundary, Icon (ícones desenhados).

## Lógica pura (frontend/src/lib) — espelha o `@forja/core`
`progression` · `onerm` · `history` · `effort` · `muscles` · `body-paths` · `demo`/`demoSeed` ·
`exercises`/`exercises-data` · `import-csv`/`import-effort` · `plan-share` · `push` · `sound` ·
`wakelock` · `coach`/`coach-api`/`coach-demo` · `i18n` (12 locales) · `starter` · `glyphs` ·
`format` · `nav` · `mobile`. (Forja já cobre: progression, onerm, history, streak, schedule,
wakelock, muscles-básico, effort-básico.)

## Lista de features (do README oficial, canônica)
1. **Peso corporal** — gráfico com linha de meta; ganho/perda colorido por direção à meta.
2. **Plano semanal** — rotina por dia, sobre **1.324 exercícios** (busca + demos animados).
3. **Remarcar qualquer dia** — override por data sem mexer no plano.
4. **Treino guiado** — sabe o dia, **pergunta o peso corporal primeiro**, pré-preenche cargas,
   rest timer, **detecção de PR**, peso por exercício.
5. **Tela acordada** (wake lock) com toggle em Settings.
6. **Supersets** — montar e logar em sequência, descanso só depois do par.
7. **Exercícios por tempo** — pranchas/hangs/wall-sits/carries por tempo, com **work timer** que
   cronometra a série (separado do rest); podem ter carga.
8. **Progressão com regra** — por rotina, override por exercício: linear, **Greyskull LP**, **dupla**,
   **tempo**. Pré-preenche + diz o *porquê*; miss não avança; stall → deload; peso corporal progride em reps.
9. **1RM estimado** — do melhor set elegível (nomeia qual), curva + calculadora; teto 12 reps.
10. **Esforço por série** — RIR ou RPE opcional; não afeta progressão/1RM; **lido de volta como estatística**.
11. **Cardio** — tempo + velocidade.
12. **Compartilhar plano** — arquivo pequeno (só rotinas+semana) ou **PDF**; import é merge.
13. **Filtro por equipamento** — opções adaptativas (toda combinação tem resultado).
14. **Exercícios próprios** — nome + body part basta; descrição no lugar da animação.
15. **Heatmap de atividade** — ano estilo GitHub, por tempo treinado.
16. **Mapa muscular** — frente+costas por volume (semana/mês/tudo); **nomeia músculos NÃO treinados**;
    **preview do que a rotina acerta enquanto monta**; mostra o que acabou de treinar; **male/female**.
17. **Push notifications** — rest timer com app fechado + lembrete de dia planejado não logado (VAPID).
18. **AI Coach** (o que o fork adiciona) — IA que **desenha** o plano e **revisa pelo que você loga**:
    intake → plano refinável em linguagem natural; sob demanda/agendado lê stalls/esforço/aderência/peso
    e propõe **change-sets explicados** aceitos um a um (snapshot + revert). Provider **Claude Agent SDK**
    ou **OpenAI Codex CLI**. Off até habilitar; consentimento por perfil; progressão continua dona das cargas.
19. **Passkeys** (WebAuthn) — cada perfil com dados próprios, sync entre devices.
20. **Admin dashboard** — quem treina agora, histórico, desabilitar conta, signup por convite.
21. **Design** — claro/escuro + **8 cores de acento**; ícones desenhados.
22. **12 idiomas** — UI completa; instruções de exercício em 10, sob demanda.
23. **Importadores** — **FitNotes/Strong/Hevy** (com RPE) + peso do **Apple Health**; casa nomes com a biblioteca.
24. **Export/import JSON** 1-tap, **guest mode**, **sem telemetria**.
25. **APK Android standalone** (Capacitor), lembretes nativos.

## Destaques do CHANGELOG (ideias de UX)
- **Esforço como estatística:** média semanal + nº de sets; spread na escala; **ponto de esforço na
  curva do top-set**; agrega RIR/RPE internamente.
- **Wake lock** sobrevive a troca de aba e segue o treino; avisa quando não há suporte.
- **Rest timer:** botão −15s; layout compacto de 3 controles; barra quase opaca.
- **Settings agrupadas** por efeito (Geral / Durante o treino / …).
- **Timed sets + work timer** (#16): cronometra a série e loga o tempo segurado.

## Roadmap deles (o que falta até pra eles)
Aberto: **programação por % / 5-3-1** (training max); mais **starter plans** (upper/lower, full-body,
5×5); **medidas corporais** (cintura, braço…); **notas por exercício + calculadora de anilhas**;
instruções de exercício em DE/PT.

## Leitura atual para a Forja
O Forja oferece uma PWA sem instalação de servidor. A proposta testada combina um plano adequado ao equipamento disponível, treino guiado, regra de progressão escolhida pela pessoa e restauração de dados. A comparação de produto também considera FitNotes para registro local e Hevy Trainer para recomendações de progressão. O [PRD](../project/PRD.md) registra o recorte e o [gap analysis](GAP-ANALYSIS.md) registra o aceite de cada grupo. [openGym](https://github.com/alexpcosta/opengym) · [FitNotes](https://www.fitnotesapp.com/privacy/) · [Hevy Trainer](https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program)
