# Forja · Roadmap

Atualizado em 14/11/2026. O [PRD](PRD.md) define o aceite de produto e o [STATE](STATE.md) registra a retomada.

| Fase | Estado | Entrega |
| --- | --- | --- |
| F0 Fundação | Implementada | Monorepo TypeScript/pnpm, React/Vite, core Vitest, Dexie, seed e PWA estática. |
| F1 Treino | Implementada | Biblioteca, rotinas, plano semanal, exceção por data, treino avulso, registro guiado, peso e histórico editável. |
| F2 Progressão | Corrigida e testada no core | Snapshot efetivo, carga comparada ao alvo, referência inicial, isolamento de rotinas/políticas e ordem por data/horário. |
| F3 Insights | Implementada | Heatmap, streak, volume, cobertura muscular, 1RM e esforço. |
| F3.5 Execução | Implementada com pendências de aceite | Supersets, cardio, timers recuperáveis, PR, mapa e biblioteca. Ver specs de mídia, PR e timers. |
| F4 Backup | Implementada e testada com IndexedDB simulado | Backup v2 inclui medidas, compatibilidade v1, validação antes de restaurar e ações explícitas. |
| F4.5 Portabilidade | Implementada com pendências de fixture | CSVs, peso Apple Health, plano JSON v2, impressão e esforço agregado. Validar exports reais e PDF no browser. |
| F5 Conforto | Em andamento | Quatro planos, temas, medidas, notas, anilhas e 5/3/1. P5-003 incompleto. P5-006/P5-007 aguardam evidência de demanda. |
| F6 Coach | Futuro | Revisão determinística primeiro. IA opcional só após validar demanda, runtime e privacidade. |

## Próximas entregas

1. Retomar P5-003 a partir da infraestrutura existente. Validar seletor, cobertura, idioma do documento e PT → EN → reload → PT.
2. Rodar o piloto com instalação, modo avião, atualização, dois treinos e restauração em perfil limpo. Validar teclado, leitor de tela, layout estreito e contraste contextual.
3. Decidir a licença do projeto. Expandir o conjunto de demonstrações com verificação por imagem e avaliar rotação de rotinas e inventários por academia após o piloto.
4. Priorizar APK e notificações locais conforme o piloto. Decidir o Coach depois de testar a revisão baseada nas regras.

P5-006 não assume agendamento confiável de notificações web com o app fechado. P5-007 pode avaliar notificações locais no Android. Sync, passkeys, multiusuário e admin ficam fora do escopo.
