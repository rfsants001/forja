# Forja desktop e acesso pelo celular

## Produto

O instalador disponibiliza a Forja em Windows, macOS e Linux. Ao abrir o aplicativo, o processo principal inicia o servidor local, abre a interface e informa se o banco está pronto. A instalação desktop concentra o catálogo, o banco SQLite, os perfis de IA e a configuração de rede. O celular usa a PWA já servida pelo mesmo processo.

Em **Dispositivos → Abrir no celular**, a Forja mostra o endereço alcançável pelo celular e um QR Code de pareamento de uso único. O QR abre a PWA e a confirmação de acesso segue a sessão do dono. O fluxo mostra o estado da rede, do certificado e do pareamento. Se o celular estiver em outra rede, a pessoa consegue copiar o endereço e entender como conectar os dois dispositivos à mesma rede.

## Arquitetura proposta

- Empacotar com Electron na primeira prova. A Forja já usa Node, Vite e SQLite. O processo principal pode iniciar e parar o servidor existente sem exigir um runtime separado de quem instala.
- Abrir uma janela com isolamento de contexto, sandbox ativa e integração Node desativada. A interface usa a API existente. Links externos abrem no navegador do sistema.
- Iniciar em loopback. Ativar acesso móvel em uma ação da pessoa e anunciar apenas o nome ou endereço correspondente ao certificado e à interface LAN utilizada.
- Servir a PWA móvel em HTTPS confiável para permitir instalação, service worker e sync. O assistente de configuração aceita um domínio e certificado de uma instalação existente e explica a exigência de confiança do aparelho. Avaliar numa prova como provisionar HTTPS local sem publicar o servidor nem exigir um backend da Forja.
- Reutilizar pareamento, autorização do dono, expiração de códigos e revogação. O QR contém um endereço e um identificador temporário. A chave administrativa e as credenciais de IA ficam no computador.
- Usar o diretório de dados da aplicação do sistema. Manter uma única instância de servidor, gravar backups antes de migrações e encerrar conexões antes de fechar o SQLite. Mostrar erro acionável se a porta estiver ocupada.
- Gerar instaladores assinados onde a plataforma exigir e validar a atualização preservando banco e configurações. O modo navegador continua disponível pelo mesmo servidor.
- Verificar Electron contra Tauri após a prova. Um sidecar Node com Tauri é uma alternativa se tamanho do pacote e consumo justificarem o empacotamento adicional.

## Entregas e aceite

1. Empacotar o servidor, a interface e os recursos PWA. Instalar e iniciar em Windows, macOS e Linux com uma ação.
2. Criar a configuração de HTTPS da rede local e reusar o QR de pareamento. Abrir e instalar no Android e iOS físicos, sincronizar um treino e revogar um aparelho.
3. Testar retomada após suspensão, banco ocupado, porta em uso, troca de Wi-Fi e reinício da máquina.
4. Testar conexão e geração com os provedores suportados no host e verificar que as credenciais permanecem no processo servidor.
5. Validar instaladores, atualização e rollback com base de dados existente.

Status em 18 de novembro de 2026. Em planejamento.
