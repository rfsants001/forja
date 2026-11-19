# Boas-vindas e introdução

## Produto e UX

Ao abrir a Forja, mostrar uma abertura com a marca existente, grafite/âmbar e animação discreta de inicialização. O indicador é indeterminado: não representa progresso percentual do banco. Depois, apresentar quatro slides: planejar a semana, cadastrar equipamentos, registrar e acompanhar treinos, cuidar dos dados e sincronizar opcionalmente.

- Próximo, Voltar, navegação por etapa e Pular introdução; sem avanço automático.
- Checkbox **Não mostrar a introdução novamente**, inicialmente desmarcado. Pular e concluir respeitam a opção.
- Exemplos visuais feitos em HTML/SVG com ícones e gráfico de linha. Identificados como ilustrativos; nenhum dado fictício é inserido no banco.
- PT/EN, temas existentes, layout móvel/desktop, foco por etapa e preferência de movimento reduzido.
- Preservar a URL de entrada. Sessão ativa e link `/conectar` entram direto no app após inicialização.

## Aceite

- [x] Abertura enquanto o IndexedDB inicializa; erro de abertura tem ação de tentar novamente.
- [x] Quatro slides, navegação por teclado, pular e concluir.
- [x] Preferência local `Settings.hideIntro?: boolean`, gravada apenas por ação explícita e aceita em backups antigos/novos.
- [x] Intro volta no próximo carregamento se a opção não estiver marcada.
- [x] Idioma, tema claro/escuro e movimento reduzido respeitados.
- [x] Sem alterar rotinas, agenda, histórico ou URL durante a introdução.

## SDD e continuidade

`main.tsx` cria uma única promise de inicialização fora do StrictMode e monta `AppStartup` imediatamente. A abertura aguarda essa promise e um intervalo visual curto; movimento reduzido elimina o intervalo. `AppStartup` só monta o app após o fluxo. A preferência vem de `getSettings`; a gravação usa `updateSettings`, com erro visível e nova tentativa. Preferências são locais, fora da sincronização de tabelas de treino. O checkbox fica no rodapé durante todos os slides.

Estilos em `styles/startup.css`; Framer Motion já existente anima a troca de slides. A logo é `/favicon.svg`. Não instalar outro motor de animação nem gerar imagens para esse fluxo. Os gráficos e equipamentos dos exemplos permanecem separados dos registros reais.

Validar mudanças com o build de produção: abrir/recarregar com a preferência marcada e desmarcada, verificar PT/EN, teclado, URL profunda, sessão ativa e pareamento. A validação em leitor de tela/aparelhos físicos continua pendente no estado do projeto.
