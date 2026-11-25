# Academia offline · revisão e correções

Atualizado em 25/11/2026. Escopo desta entrega: revisar e corrigir a jornada offline da PWA existente. Não representa a entrega dos instaladores desktop/mobile nem uma garantia de funcionamento em qualquer aparelho antigo.

## Jornada de produto

1. Abrir a versão de produção em origem segura, instalar quando o navegador permitir e salvar um plano no aparelho.
2. Conferir **Pronto para treinar offline** antes de sair: os recursos da aplicação e as definições dos exercícios do plano precisam estar presentes.
3. Com internet e computador desligados, abrir o app, consultar as demonstrações locais e o atlas, registrar séries/descanso e concluir o treino.
4. Reabrir e encontrar os registros locais. As alterações de uma instalação já vinculada permanecem na fila até o servidor ficar alcançável.
5. Com o app aberto, sincronizar e receber uma única sessão nos demais aparelhos. Fechar o app não garante execução de sync em segundo plano em todos os sistemas.

Pareamento e VPN não são requisitos para treinar. A configuração inicial da PWA em um celular ainda precisa de HTTPS confiável. A IA usa o host/provedor para criar propostas; executar um plano salvo é local. YouTube exige rede.

## Achados e implementação

| Achado | Correção |
| --- | --- |
| Ausência de confirmação de preparo offline | `offline-manifest.mjs` enumera o resultado final da build em `offline-assets.json`. `lib/offline.ts` verifica as chaves de revisão exatas em Cache Storage, controle do service worker e armazenamento; `OfflinePanel` confere também rotinas e suas definições locais. Indicador disponível em Hoje e Perfil. Não usa `navigator.onLine` como prova de preparo. |
| Inventário não pode usar chunks intermediários | O inventário é gerado em `writeBundle`: Vite remove chunks vazios de CSS depois de `generateBundle`, e só a saída final contém o HTML definitivo. |
| Recursos estáticos ausentes do conjunto de precache | Workbox inclui JSON, PNG, SVG e WOFF, além de JS/CSS/HTML/WebP/WOFF2. API fica fora do cache e da navegação fallback. |
| Recuperação após remoção parcial do cache | O precache tem integridade SRI por arquivo. Conferir recursos busca os arquivos ausentes pelo worker, que só repara respostas da versão esperada. Uma falha não é convertida artificialmente em estado pronto. |
| Atualização sem controle da sessão | Estratégia `prompt`, sem skipWaiting automático. A pessoa escolhe Atualizar; sessão ativa, rascunho persistido em outra aba, editor de rotina ou diálogo bloqueiam a ação. |
| Vinculado confundido com sincronizado | Estado derivado da fila, conflitos, execução e último sucesso. Sem vínculo: somente neste aparelho. Falha de acesso ao servidor: aguardando. Apenas vincular não é sucesso de sync. |
| Falhas de gravação do rascunho pouco visíveis | Adaptador de localStorage comunica falhas de escrita e conserva o estado em memória. A faixa orienta manter o app aberto e tentar salvar novamente. Falha de leitura é reportada à hidratação e o retry tenta reler, sem substituir silenciosamente por um rascunho vazio. Na abertura, um rascunho cujo ID já foi gravado no Histórico é reconciliado, cobrindo crash entre o commit e a limpeza do rascunho. |
| Preparo e instalação pouco acessíveis | Perfil inclui conferência, pedido de armazenamento persistente, backup e instruções Android/iOS/desktop. A concessão depende do navegador e não substitui backup. |
| QR local induz tentativa impossível no celular | A UI de Dispositivos desabilita a geração móvel quando a origem é loopback/HTTP, explica HTTPS e separa uso offline de sync. A API mantém loopback para desenvolvimento e testes. |
| Assistente offline parecia configuração quebrada | Explicação específica; novas gerações ficam indisponíveis offline, sem impedir o uso das rotinas já salvas e a importação local. |

O controle de rascunho não promete salvar com o armazenamento cheio. Nesse caso, a UI mostra o erro e permite tentar novamente enquanto os dados permanecem em memória. O backup atual inclui planos e treinos concluídos, não a sessão ativa.

## Verificação reproduzível

- `pnpm test`: testes de domínio/servidor e regras de estado, inventário de build, integridade e falhas do armazenamento do rascunho.
- `pnpm typecheck` e `pnpm build`.
- Instalar o navegador de teste uma vez com `pnpm exec playwright install chromium` e executar `pnpm test:offline`. O comando faz a build de produção e usa dois contextos independentes, serviço real e SQLite temporário.
- Para um Chromium instalado, definir `PLAYWRIGHT_EXECUTABLE_PATH`. Capturas opcionais: `FORJA_QA_ARTIFACTS`; porta opcional: `FORJA_QA_PORT`. Dados pessoais não entram no teste e a pasta temporária é removida ao terminar.

O roteiro cobre importação de plano, navegação direta ao preparo, cache real, remoção/reparo de um arquivo, vínculo de dois aparelhos simulados, desligamento do servidor, modo avião, reabertura fria, mídia/atlas, séries/descanso, falha de armazenamento e retry, finalização local, reconciliação de rascunho já concluído, reconexão sem duplicação e atualização bloqueada entre abas. Também confere backup, PT/EN e larguras móveis. Evidência é de navegador automatizado, não aparelho físico.

### Resultado desta execução

- 147 testes do core + 50 do servidor (197), typecheck e build passaram.
- `pnpm test:offline` passou com Chromium/Brave em Linux: cache/reparo, modo avião e servidor desligado, reabertura fria com sessão e mídia, erro/retry do rascunho, reconciliação do registro já concluído, reconexão entre dois contextos sem duplicação, atualização entre abas, backup, PT/EN, tema claro e 320/390/1440 px. Sem erros JavaScript.
- Capturas de desktop/celular usam dados fictícios e estão no README. Não representam teste em aparelhos físicos.

## Pendências que continuam abertas

- Android/iPhone físicos: instalar/atualizar, bloquear a tela, suspender/matar o app, retomar timers, proteção de dados do navegador e acessibilidade.
- Empacotar e validar desktop Windows/macOS/Linux, assinatura/atualizações, servidor embutido e interface de rede. Ver [desktop/PWA](../desktop-pwa/spec.md).
- Resolver a primeira conexão HTTPS com experiência guiada: domínio/certificado confiável na PWA, ou avaliar um cliente móvel distribuído com recursos locais. Um wrapper móvel exige adaptar origem da API e autenticação; não basta empacotar a página.
- Definir a expansão de sync para peso, medidas, objetivos e inventário; esses dados continuam locais nesta entrega. Preservar a sessão em execução como estado próprio de cada aparelho.
- Validar a rede ZeroTier e o HTTPS em dois aparelhos reais; não transformar uma VPN específica em requisito do app.

[Estado](../../project/STATE.md) · [Arquitetura](../../codebase/ARCHITECTURE.md)
