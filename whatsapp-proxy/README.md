# Backend Escola de Esportes

Backend em Cloudflare Workers usado pelo sistema da Escola de Esportes. Este projeto concentra as integrações que não devem rodar diretamente no navegador: Asaas, Evolution API/WhatsApp, armazenamento de imagens em KV, fila de mensagens e automações agendadas.

## O que este backend faz

- Cria cobranças no Asaas.
- Gera carnês/parcelas mensais.
- Consulta cliente por CPF/CNPJ no Asaas.
- Consulta status de pagamento.
- Lista cobranças do Asaas.
- Atualiza ou exclui cobranças.
- Marca uma cobrança como recebida em dinheiro no Asaas.
- Consulta saldo financeiro da conta Asaas.
- Envia mensagens de WhatsApp pela Evolution API.
- Enfileira mensagens para envio controlado.
- Processa fila automaticamente por cron.
- Faz upload e leitura pública de imagens pelo Cloudflare KV.
- Executa automação financeira de lembretes de cobrança.
- Executa automação de aniversários.
- Registra histórico de mensagens no Firestore.
- Expõe documentação técnica via `/docs` e `/openapi.json`.

## Arquivos principais

- `src/index.js`: Worker completo com todas as rotas HTTP, tarefas agendadas e funções auxiliares.
- `wrangler.toml`: configuração do Cloudflare Worker, KV, variáveis públicas e cron.
- `create_kv.bat`: atalho antigo para criação do namespace KV.
- `.dev.vars.example`: modelo de variáveis secretas para ambiente local.

## Serviços usados

### Cloudflare Workers

O Worker roda em ambiente serverless e recebe as chamadas do frontend.

Configuração atual em `wrangler.toml`:

- Nome do Worker: `uba-whatsapp-proxy`
- Arquivo principal: `src/index.js`
- Binding KV: `UBA_STORAGE`
- Cron: `* * * * *`, executando a cada minuto

### Cloudflare KV

O KV `UBA_STORAGE` é usado para:

- Fila de mensagens: chaves `mq:pending:*`
- Estado de pausa da fila: `mq:paused`
- Imagens enviadas: chaves `img:*`
- Controle de automações já executadas
- Travas para evitar disparos financeiros duplicados

### Asaas

O backend usa `https://api.asaas.com/v3` para:

- Criar clientes, quando necessário
- Criar cobranças
- Gerar carnês
- Consultar cobranças
- Atualizar cobranças
- Excluir cobranças
- Marcar cobrança como recebida em dinheiro
- Consultar saldo
- Obter QR Code Pix

O token do Asaas deve ficar em secret do Cloudflare:

```bash
npx wrangler secret put ASAAS_API_KEY
```

### Evolution API

O backend usa a Evolution API configurada em `src/index.js` para enviar WhatsApp.

Constantes atuais:

- URL base: `https://evolution-api-im3d.onrender.com`
- Instância padrão: `uba_instance`

O token deve ficar em secret:

```bash
npx wrangler secret put EVOLUTION_API_KEY
```

### Firebase/Firestore

O Worker acessa Firestore pela API REST usando as variáveis públicas:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_API_KEY`

Essas variáveis estão no `wrangler.toml` porque são credenciais públicas do projeto Firebase, não tokens administrativos. Mesmo assim, as regras do Firestore precisam estar corretas, porque a API key pública não protege dados por si só.

Coleções usadas pelo Worker:

- `system_settings/whatsapp`
- `uba_2026_registrations`
- `financial_payments`
- histórico de logs de WhatsApp, conforme função `logToFirestore`

## Variáveis e secrets

### Secrets obrigatórios

Configure no Cloudflare:

```bash
npx wrangler secret put ASAAS_API_KEY
npx wrangler secret put EVOLUTION_API_KEY
```

### Variáveis públicas

Ficam no `wrangler.toml`:

```toml
[vars]
FIREBASE_PROJECT_ID = "cadastro-uba"
FIREBASE_API_KEY = "..."
```

### Desenvolvimento local

Para rodar localmente, copie:

```bash
cp .dev.vars.example .dev.vars
```

Depois preencha:

```env
EVOLUTION_API_KEY="..."
ASAAS_API_KEY="..."
```

O arquivo `.dev.vars` está ignorado no Git.

## Instalação

```bash
npm install
```

## Rodar localmente

```bash
npm run dev
```

O Wrangler abrirá uma URL local. Use essa URL como base para testar as rotas.

## Validar build sem publicar

```bash
npm run dry-run
```

Isso gera um pacote temporário de deploy sem alterar produção.

## Deploy

Faça login no Cloudflare, se necessário:

```bash
npx wrangler login
```

Depois publique:

```bash
npm run deploy
```

## Criar KV em uma conta nova

Se o projeto for configurado em outra conta Cloudflare:

```bash
npm run kv:create
```

Depois copie o `id` retornado e atualize o bloco em `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "UBA_STORAGE"
id = "ID_DO_NAMESPACE"
```

## Rotas de documentação

### `GET /docs`

Abre uma interface Swagger com a documentação embutida.

### `GET /openapi.json`

Retorna a especificação OpenAPI em JSON.

## Rotas de fila de mensagens

### `POST /queue/enqueue`

Enfileira mensagens para envio posterior.

Exemplo:

```json
{
  "messages": [
    {
      "number": "5533999999999",
      "text": "Mensagem de teste"
    }
  ]
}
```

### `GET /queue/list`

Lista até 100 mensagens pendentes e informa se a fila está pausada.

### `POST /queue/clear`

Remove todas as mensagens pendentes.

### `POST /queue/toggle-pause`

Pausa ou retoma o processamento da fila.

### `POST /queue/process`

Dispara o processamento manual da fila.

## Rotas de imagens

### `POST /images/upload`

Upload via `FormData`. Campo obrigatório:

- `file`: arquivo enviado

Campo opcional:

- `folder`: prefixo lógico do arquivo

Limite atual: 5 MB.

Resposta:

```json
{
  "data": {
    "url": "https://worker/view/id"
  },
  "url": "https://worker/view/id"
}
```

### `POST /upload`

Upload legado via corpo binário bruto. Aceita `customId` por query string.

Limite atual: 2 MB.

### `GET /view/:id`

Retorna a imagem armazenada no KV.

## Rotas Asaas e financeiro

### `GET /customers-by-cpf/:cpf`

Busca cliente no Asaas pelo CPF/CNPJ.

### `POST /create-payment`

Cria uma cobrança no Asaas. Se o payload não trouxer `customer`, o backend tenta criar ou localizar o cliente.

Campos comuns:

```json
{
  "name": "Nome do responsável",
  "cpfCnpj": "00000000000",
  "email": "responsavel@email.com",
  "phone": "33999999999",
  "billingType": "PIX",
  "value": 120,
  "dueDate": "2026-07-10",
  "description": "Mensalidade JUL - Aluno",
  "externalReference": "registrationId:studentId"
}
```

### `POST /generate-carnet`

Gera uma sequência de cobranças mensais.

Campos comuns:

```json
{
  "name": "Nome do responsável",
  "cpfCnpj": "00000000000",
  "email": "responsavel@email.com",
  "phone": "33999999999",
  "billingType": "PIX",
  "value": 120,
  "paymentDay": 10,
  "months": 12,
  "description": "Mensalidade",
  "externalReference": "registrationId:studentId"
}
```

### `GET /payment-status?paymentId=ID`

Consulta uma cobrança específica no Asaas.

### `GET /finance/balance`

Consulta o saldo da conta Asaas.

### `GET /payments`

Lista cobranças do Asaas. A query string é repassada para a API do Asaas.

Exemplo:

```text
/payments?customer=cus_000000&status=PENDING&limit=50
```

### `GET /payments/:id`

Consulta uma cobrança pelo ID.

### `PUT /payments/:id`

Atualiza uma cobrança. O Worker normaliza valores monetários antes de enviar ao Asaas.

### `DELETE /payments/:id`

Remove uma cobrança no Asaas.

### `POST /payments/:id/receive-in-cash`

Marca uma cobrança como recebida em dinheiro no Asaas.

Exemplo:

```json
{
  "paymentDate": "2026-07-02",
  "value": 120,
  "notify": false
}
```

## Rotas de automação

### `POST /birthday-automation-trigger`

Executa manualmente a automação de aniversários e enfileira mensagens.

### `POST /financial-automation-trigger`

Executa manualmente a automação financeira.

Exemplo:

```json
{
  "testDate": "2026-07-10",
  "testPhone": "5533999999999"
}
```

## Proxy para Evolution API

Qualquer rota não tratada explicitamente cai no proxy da Evolution API.

Atalho especial:

### `POST /send`

Encaminha para:

```text
/message/sendText/uba_instance
```

Outras rotas são repassadas para:

```text
https://evolution-api-im3d.onrender.com{path}
```

## Cron

O cron roda a cada minuto:

```toml
[triggers]
crons = ["* * * * *"]
```

A rotina agendada:

1. Processa a fila de mensagens.
2. Executa fluxo financeiro conforme configuração no Firestore.
3. Executa automações programadas quando aplicável.

## Observação importante sobre webhook Asaas

No código atual deste backend da UBA não existe rota explícita `/asaas/webhook`. A sincronização financeira principal ocorre por consultas ao Asaas, processamento de cobranças e automações. Se o webhook Asaas for necessário neste projeto, ele deve ser implementado no Worker e configurado no painel do Asaas apontando para a URL pública do Worker.

## Segurança

- Nunca versionar `.dev.vars`, `.env`, tokens do Asaas ou tokens da Evolution API.
- Tokens reais devem ser configurados com `wrangler secret put`.
- O `FIREBASE_API_KEY` é público, mas as regras do Firebase precisam proteger as coleções.
- As rotas de gerenciamento de fila e financeiro aceitam CORS aberto no código atual. Para uso público amplo, recomenda-se adicionar autenticação administrativa nas rotas sensíveis.

## Checklist de produção

1. Conferir `wrangler.toml`.
2. Conferir o ID do namespace `UBA_STORAGE`.
3. Configurar `ASAAS_API_KEY`.
4. Configurar `EVOLUTION_API_KEY`.
5. Rodar `npm run dry-run`.
6. Rodar `npm run deploy`.
7. Acessar `/docs`.
8. Testar `/finance/balance`.
9. Testar criação de cobrança em ambiente seguro.
10. Testar envio WhatsApp para número controlado.
11. Testar upload e leitura por `/view/:id`.
12. Conferir logs com `npm run tail`.
