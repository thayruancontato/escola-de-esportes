/**
 * Cloudflare Worker: Proxy para Evolution API v2 + Armazenamento de Imagens + Fila de Mensagens
 */
import { RESUMO_ADMIN_JPEG_BASE64 } from "./assets/resumoAdminImage.js";
import { PAGAMENTO_JPEG_BASE64 } from "./assets/pagamentoIdentificadoImage.js";

const EVOLUTION_URL = "https://evolution-api-im3d.onrender.com";
const ASAAS_URL = "https://api.asaas.com/v3";
const INSTANCE_NAME = "uba_instance";
const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const OPENAPI_SPEC = {
  openapi: "3.0.0",
  info: {
    title: "Portal Supremo UBA 2026",
    description: "Este portal é a central técnica definitiva do ecossistema UBA 2026. Ele integra a documentação de Backend (Cloudflare Workers), Persistência (Firestore) e Frontend (React Portals). Abaixo você encontrará o mapeamento de APIs, rotas de navegação do usuário e algoritmos de sincronização financeira. Esta é a única fonte de verdade para a engenharia do projeto.",
    version: "1.3.0"
  },
  servers: [{ url: "https://uba-whatsapp-proxy.thayrufino2.workers.dev", description: "Produção" }],
  tags: [
    { name: "Sistemas & Infraestrutura", description: "Endpoints do Worker para WhatsApp, processamento de mídias e logística de fila." },
    { name: "Portal do Administrador", description: "Interfaces e rotas de gestão (Dashboard, Turmas, Financeiro, Configurações)." },
    { name: "Portal do Aluno", description: "Rotas de autoatendimento para responsáveis (Carteirinha, Financeiro, Perfil)." },
    { name: "Protocolos de Dados", description: "Esquemas de coleções do Firestore e modelos das entidades de negócio." }
  ],
  paths: {
    /* --- BACKEND --- */
    "/queue/enqueue": {
      post: {
        tags: ["Sistemas & Infraestrutura"],
        summary: "Enfileiramento Massivo de Mensagens",
        responses: { 200: { description: "Sucesso no enfileiramento." } }
      }
    },
    "/upload": {
      post: {
        tags: ["Sistemas & Infraestrutura"],
        summary: "Armazenamento Persistente de Mídias",
        responses: { 200: { description: "URL de acesso concedida." } }
      }
    },

    /* --- FRONTEND ADMIN --- */
    "/admin/dashboard": {
      get: {
        tags: ["Portal do Administrador"],
        summary: "Painel Principal de Gestão",
        description: "Página mestre com listagem de alunos, filtros de inadimplência e ações rápidas de matrícula.",
        responses: { 200: { description: "Visualização do Dashboard." } }
      }
    },
    "/admin/financeiro": {
      get: {
        tags: ["Portal do Administrador"],
        summary: "Módulo Financeiro Central",
        description: "Gestão de integração Asaas, faturas, fluxo de caixa e reconciliação bancária.",
        responses: { 200: { description: "Visualização Financeira." } }
      }
    },
    "/admin/turmas": {
      get: {
        tags: ["Portal do Administrador"],
        summary: "Gestão Acadêmica de Turmas",
        description: "Controle de horários, alocação de modalidades (Futebol/Natação) e diário de classe.",
        responses: { 200: { description: "Visualização de Turmas." } }
      }
    },

    /* --- FRONTEND ALUNO --- */
    "/aluno/carteirinha": {
      get: {
        tags: ["Portal do Aluno"],
        summary: "Acesso Digital do Estudante",
        description: "Interface para exibição da carteirinha digital com QR Code de acesso ao clube.",
        responses: { 200: { description: "Visualização da Carteirinha." } }
      }
    },
    "/aluno/financeiro": {
      get: {
        tags: ["Portal do Aluno"],
        summary: "Portal de Pagamentos (Responsável)",
        description: "Visualização de faturas em aberto e link direto para pagamento via Asaas.",
        responses: { 200: { description: "Visualização do Financeiro Aluno." } }
      }
    },
    "/finance/balance": {
      get: {
        tags: ["Sistemas & Infraestrutura"],
        summary: "Consulta de Saldo Asaas",
        description: "Retorna o saldo atual da conta Asaas integrada via proxy.",
        responses: { 200: { description: "Saldo retornado com sucesso." } }
      }
    }
  },
  components: {
    schemas: {
      RegistrationDoc: {
        type: "object",
        description: "Modelo de dados mestre no Firestore (uba_2026_registrations).",
        properties: {
          responsavel: { type: "object", description: "Dados do titular financeiro." },
          status: { type: "string", enum: ["pago", "pendente", "atrasado"], description: "Status calculado via Deep Sync." },
          alunos: { type: "array", items: { type: "object" }, description: "Lista de dependentes vinculados." }
        }
      },
      FinancialStatus: {
        type: "object",
        description: "Resultado do processamento de adimplência.",
        properties: {
          pendingAmount: { type: "number" },
          description: { type: "string" },
          invoiceUrl: { type: "string" }
        }
      }
    }
  }
};

const SWAGGER_HTML = (url) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Manual Supremo | UBA 2026</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4.5.0/swagger-ui.css" />
  <style>
    body { background: #f1f5f9; margin: 0; font-family: 'Inter', system-ui, sans-serif; }
    .swagger-ui .topbar { background-color: #00237f; border-bottom: 5px solid #c32228; padding: 15px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .swagger-ui .info .title { color: #00237f; font-size: 3em; font-weight: 900; letter-spacing: -1.5px; }
    .swagger-ui .info .description { font-size: 1.2em; line-height: 1.8; color: #1e293b; max-width: 1000px; border-left: 4px solid #c32228; padding-left: 20px; background: #fff; border-radius: 4px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
    
    .swagger-ui .opblock-tag { font-size: 1.8em; color: #00237f; border-bottom: 2px solid #cbd5e1; padding-bottom: 15px; margin-top: 50px; }
    
    /* Botões Execute */
    .swagger-ui .btn.execute { background-color: #c32228; border: none; font-weight: 900; padding: 15px 50px; font-size: 1.1em; }
    .swagger-ui .btn.execute:hover { background-color: #a01c21; transform: scale(1.02); }
    
    /* Blocos Operacionais */
    .swagger-ui .opblock.opblock-post { border-radius: 8px; border-color: #c32228; background: #fff; }
    .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #c32228; }
    .swagger-ui .opblock.opblock-get { border-radius: 8px; border-color: #00237f; background: #fff; }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #00237f; }

    .swagger-ui section.models { border-radius: 12px; margin: 60px 0; overflow: hidden; border: 1px solid #e2e8f0; }
    .swagger-ui section.models h4 { background: #00237f; color: #fff; padding: 15px 25px; margin: 0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4.5.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '${url}/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, apikey, ApiKey, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // --- DOCUMENTAÇÃO SWAGGER ---
    if (path === "/docs") {
      return new Response(SWAGGER_HTML(url.origin), {
        headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders }
      });
    }

    if (path === "/openapi.json") {
      return new Response(JSON.stringify(OPENAPI_SPEC), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // --- ENDPOINT DE ENFILEIRAMENTO ---
    if (path === "/queue/enqueue" && request.method === "POST") {
      try {
        const { messages } = await request.json();
        if (!Array.isArray(messages)) throw new Error("Mensagens devem ser um array");

        const batchId = crypto.randomUUID().substring(0, 8);
        const timestamp = Date.now();

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          const id = crypto.randomUUID();
          // mq:pending:{timestamp}:{batchId}:{index}
          const key = `mq:pending:${timestamp}:${batchId}:${i.toString().padStart(4, '0')}`;
          await env.UBA_STORAGE.put(key, JSON.stringify({
            ...msg,
            enqueuedAt: new Date().toISOString()
          }));
        }

        return new Response(JSON.stringify({ success: true, count: messages.length, batchId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // --- WHATSAPP HUB (proxy) ---
    // A chave do hub fica só aqui no servidor - o admin nunca chama o hub direto do navegador.
    // Usa Service Binding (não fetch por URL pública - Workers não podem se chamar via
    // *.workers.dev entre si, a Cloudflare bloqueia isso com o erro 1042).
    if (path === "/hub/messages" && request.method === "POST") {
      if (!env.WHATSAPP_HUB || !env.WHATSAPP_HUB_API_KEY) {
        return jsonResponse({ error: "WhatsApp Hub não configurado." }, 500, corsHeaders);
      }
      try {
        const body = await request.json().catch(() => ({}));
        const hubRes = await env.WHATSAPP_HUB.fetch("https://whatsapp-hub.internal/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.WHATSAPP_HUB_API_KEY}` },
          body: JSON.stringify(body)
        });
        const hubBody = await hubRes.json().catch(() => ({}));
        return jsonResponse(hubBody, hubRes.status, corsHeaders);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500, corsHeaders);
      }
    }

    // Prévia da imagem de um card template do hub (não envia nada, só renderiza o PNG).
    const hubPreviewMatch = path.match(/^\/hub\/templates\/([^/]+)\/preview$/);
    if (hubPreviewMatch && request.method === "POST") {
      if (!env.WHATSAPP_HUB || !env.WHATSAPP_HUB_API_KEY) {
        return jsonResponse({ error: "WhatsApp Hub não configurado." }, 500, corsHeaders);
      }
      try {
        const body = await request.json().catch(() => ({}));
        const hubRes = await env.WHATSAPP_HUB.fetch(`https://whatsapp-hub.internal/v1/templates/${hubPreviewMatch[1]}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.WHATSAPP_HUB_API_KEY}` },
          body: JSON.stringify(body)
        });
        const contentType = hubRes.headers.get("Content-Type") || "image/png";
        const buf = await hubRes.arrayBuffer();
        return new Response(buf, { status: hubRes.status, headers: { ...corsHeaders, "Content-Type": contentType } });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500, corsHeaders);
      }
    }

    // --- RESUMO DIÁRIO AO ADMINISTRADOR (teste manual + prévia) ---
    // O envio automático real acontece no cron (scheduled -> handleDailySummaryFlow),
    // essas duas rotas só existem pra página de configuração poder testar/pré-visualizar.
    if (path === "/daily-summary-trigger" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const dateStr = body.testDate || yesterdayStr(spDateParts(spNow()).dateStr);
        const result = await sendDailySummary(env, { dateStr, phone: body.testPhone });
        return jsonResponse(result, result.success ? 200 : 500, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    if (path === "/daily-summary-preview" && request.method === "GET") {
      try {
        const dateStr = url.searchParams.get("date") || yesterdayStr(spDateParts(spNow()).dateStr);
        const text = await buildDailySummaryText(env, dateStr);
        return jsonResponse({ success: true, text, imageUrl: getDailySummaryImageDataUri() }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    // --- LEMBRETES DE PAGAMENTO AOS RESPONSÁVEIS (novo sistema, substitui a automação antiga) ---
    // Prévia/teste sempre usam um aluno real aprovado aleatório com fatura real batendo com a
    // regra, mas o destino final SEMPRE passa por resolveParentPhone (toggle de segurança).
    if (path === "/payment-reminder-preview" && request.method === "GET") {
      try {
        const rule = url.searchParams.get("rule");
        if (!["BEFORE", "ONDAY", "AFTER"].includes(rule)) {
          return jsonResponse({ success: false, error: "Parâmetro 'rule' inválido." }, 400, corsHeaders);
        }
        const config = await fetchAdminNotificationsConfig(env);
        // Habilita temporariamente só a regra pedida, pra prévia funcionar mesmo se a regra
        // ainda estiver desligada na config (o admin quer ver como fica antes de ativar).
        const previewConfig = {
          ...config,
          paymentReminderBeforeEnabled: rule === "BEFORE",
          paymentReminderOnDayEnabled: rule === "ONDAY",
          paymentReminderAfterEnabled: rule === "AFTER",
        };
        const nowParts = spDateParts(spNow());
        const activePayments = await findMatchingPaymentReminders(env, nowParts.dateStr, previewConfig);
        if (activePayments.length === 0) {
          return jsonResponse({ success: true, text: null, studentName: null, message: "Nenhuma fatura real bate com essa regra hoje." }, 200, corsHeaders);
        }
        const studentsMap = await fetchApprovedStudentsMap(env);
        const eligible = activePayments
          .map(p => ({ p, fields: studentsMap[p.studentId] }))
          .filter(x => x.fields)
          .map(x => ({ p: x.p, info: studentInfoFromFields(x.fields) }))
          .filter(x => x.info.contractStatus === "aprovado" && x.info.phoneRaw);
        if (eligible.length === 0) {
          return jsonResponse({ success: true, text: null, studentName: null, message: "Nenhum aluno aprovado com telefone bate com essa regra hoje." }, 200, corsHeaders);
        }
        const pick = eligible[Math.floor(Math.random() * eligible.length)];
        const text = buildPaymentReminderText(pick.p, pick.info.nome);
        return jsonResponse({ success: true, text, studentName: pick.info.nome }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    if (path === "/payment-reminder-test" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const rule = body.rule;
        if (!["BEFORE", "ONDAY", "AFTER"].includes(rule)) {
          return jsonResponse({ success: false, error: "Parâmetro 'rule' inválido." }, 400, corsHeaders);
        }
        const config = await fetchAdminNotificationsConfig(env);
        const testConfig = {
          ...config,
          paymentReminderBeforeEnabled: rule === "BEFORE",
          paymentReminderOnDayEnabled: rule === "ONDAY",
          paymentReminderAfterEnabled: rule === "AFTER",
        };
        const nowParts = spDateParts(spNow());
        const result = await runPaymentReminderBatch(env, { virtualTodayStr: nowParts.dateStr, config: testConfig, isTest: true, onlyRule: rule });
        if (!result.sample) {
          return jsonResponse({ success: false, error: "Nenhuma fatura real de aluno aprovado bate com essa regra hoje - não há dados reais pra simular o teste." }, 200, corsHeaders);
        }
        return jsonResponse({ success: result.sample.sent, ...result.sample }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    // Confirmação de pagamento identificado, enviada ao responsável (além do aviso ao admin,
    // que continua indo pelo hub). Chamado pelo cliente assim que um pagamento é detectado.
    if (path === "/notify-parent-payment" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const { phone, nome, valor } = body;
        if (!phone) return jsonResponse({ success: false, error: "Telefone do responsável não informado." }, 400, corsHeaders);

        const config = await fetchAdminNotificationsConfig(env);
        const valorTexto = typeof valor === "number" ? ` no valor de *${formatBRLServer(valor)}*` : "";
        const text = `✅ *PAGAMENTO CONFIRMADO*\n\nOlá! Confirmamos o recebimento do seu pagamento${valorTexto}, referente ao(à) aluno(a) *${(nome || "aluno").toUpperCase()}*.\n\nObrigado por manter a mensalidade em dia! 🙌`;

        const { phone: destino, redirected } = resolveParentPhone(config, phone);
        const result = await sendParentMessage(env, destino, text);
        return jsonResponse({ success: result.success, redirected, error: result.error }, result.success ? 200 : 500, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    // Webhook real do Asaas - dispara SOZINHO assim que um pagamento é recebido/confirmado,
    // sem depender de ninguém abrir o app (portal do aluno, portaria, painel financeiro etc).
    // É a única fonte de verdade confiável pro aviso de "pagamento identificado".
    if (path === "/asaas-webhook" && request.method === "POST") {
      try {
        const authHeader = request.headers.get("asaas-access-token") || request.headers.get("Asaas-Access-Token");
        if (!env.ASAAS_WEBHOOK_TOKEN || authHeader !== env.ASAAS_WEBHOOK_TOKEN) {
          return jsonResponse({ success: false, error: "unauthorized" }, 401, corsHeaders);
        }

        const body = await request.json().catch(() => ({}));
        const eventName = body.event;
        const payment = body.payment;
        const PAID_EVENTS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];

        if (!PAID_EVENTS.includes(eventName) || !payment?.id) {
          return jsonResponse({ success: true, ignored: true }, 200, corsHeaders);
        }

        // Idempotência - a Asaas pode reenviar o mesmo evento; nunca notifica duas vezes.
        const dedupeKey = `asaas_webhook_notified:${payment.id}`;
        const already = await env.UBA_STORAGE.get(dedupeKey);
        if (already) return jsonResponse({ success: true, deduped: true }, 200, corsHeaders);

        const result = await processAsaasPaymentWebhook(env, payment);
        if (result.notified) {
          await env.UBA_STORAGE.put(dedupeKey, "true", { expirationTtl: 86400 * 60 });
        }
        return jsonResponse(result, 200, corsHeaders);
      } catch (err) {
        console.error("Erro no webhook Asaas:", err);
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    // Conta quantos lembretes seriam disparados HOJE com as regras/dias informados (rascunho
    // ainda não salvo) - alimenta o "X mensagens serão enviadas" da página de configuração.
    if (path === "/payment-reminder-count" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const draftConfig = {
          paymentReminderBeforeEnabled: !!body.paymentReminderBeforeEnabled,
          paymentReminderBeforeDays: Number(body.paymentReminderBeforeDays) || 3,
          paymentReminderOnDayEnabled: !!body.paymentReminderOnDayEnabled,
          paymentReminderAfterEnabled: !!body.paymentReminderAfterEnabled,
          paymentReminderAfterDays: Number(body.paymentReminderAfterDays) || 5,
        };
        const nowParts = spDateParts(spNow());
        const activePayments = await findMatchingPaymentReminders(env, nowParts.dateStr, draftConfig);
        if (activePayments.length === 0) return jsonResponse({ success: true, count: 0, byRule: {} }, 200, corsHeaders);

        const studentsMap = await fetchApprovedStudentsMap(env);
        const byRule = { BEFORE: 0, ONDAY: 0, AFTER: 0 };
        let count = 0;
        for (const p of activePayments) {
          const fields = studentsMap[p.studentId];
          if (!fields) continue;
          const info = studentInfoFromFields(fields);
          if (info.contractStatus !== "aprovado" || !info.phoneRaw) continue;
          count++;
          byRule[p.ruleMatched] = (byRule[p.ruleMatched] || 0) + 1;
        }
        return jsonResponse({ success: true, count, byRule }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    // Histórico dos últimos lembretes de pagamento realmente disparados (nome + foto do
    // aluno), pra aba de Histórico da página de Avisos ao Administrador.
    if (path === "/payment-reminder-history" && request.method === "GET") {
      try {
        const listUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/payment_reminder_logs?key=${env.FIREBASE_API_KEY}&pageSize=50&orderBy=${encodeURIComponent("sentAt desc")}`;
        const res = await fetch(listUrl);
        if (!res.ok) return jsonResponse({ success: true, items: [] }, 200, corsHeaders);
        const data = await res.json();
        const items = (data.documents || []).map(d => {
          const f = d.fields || {};
          return {
            studentName: fsFieldValue(f.studentName) || "",
            studentPhoto: fsFieldValue(f.studentPhoto) || "",
            rule: fsFieldValue(f.rule) || "",
            phone: fsFieldValue(f.phone) || "",
            redirected: fsFieldValue(f.redirected) || false,
            success: fsFieldValue(f.success) || false,
            isTest: fsFieldValue(f.isTest) || false,
            sentAt: f.sentAt?.timestampValue || "",
          };
        });
        return jsonResponse({ success: true, items }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    // --- ENDPOINTS DE GESTÃO DE FILA ---
    if (path === "/queue/list" && request.method === "GET") {
      const list = await env.UBA_STORAGE.list({ prefix: "mq:pending:", limit: 100 });
      const items = [];
      for (const key of list.keys) {
        const val = await env.UBA_STORAGE.get(key.name);
        if (val) items.push({ key: key.name, ...JSON.parse(val) });
      }
      const paused = await env.UBA_STORAGE.get("mq:paused") === "true";
      return new Response(JSON.stringify({ success: true, items, paused }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/queue/clear" && request.method === "POST") {
      const list = await env.UBA_STORAGE.list({ prefix: "mq:pending:" });
      for (const key of list.keys) {
        await env.UBA_STORAGE.delete(key.name);
      }
      return new Response(JSON.stringify({ success: true, message: "Fila limpa com sucesso" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/queue/toggle-pause" && request.method === "POST") {
      const current = await env.UBA_STORAGE.get("mq:paused");
      const next = current === "true" ? "false" : "true";
      await env.UBA_STORAGE.put("mq:paused", next);
      return new Response(JSON.stringify({ success: true, paused: next === "true" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (path === "/queue/process" && request.method === "POST") {
      await processQueue(env);
      return new Response(JSON.stringify({ success: true, message: "Processamento da fila disparado manualmente" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // --- ENDPOINT DE GATILHO MANUAL DE AUTOMAÇÃO DE ANIVERSÁRIOS ---
    if (path === "/birthday-automation-trigger" && request.method === "POST") {
      try {
        const count = await processBirthdays(env, true);
        // Tenta processar a fila imediatamente em background após enfileirar
        ctx.waitUntil(processQueue(env)); 
        return new Response(JSON.stringify({ success: true, count, message: `Sucesso: ${count} mensagens de aniversário enfileiradas.` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }


    // --- ENDPOINT DE UPLOAD VIA FORMDATA (usado pelo PublicForm) ---
    if (path === "/images/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const folder = formData.get("folder") || "uploads";

        if (!file || !(file instanceof File)) {
          return new Response(JSON.stringify({ error: "Nenhum arquivo enviado" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const body = await file.arrayBuffer();

        if (body.byteLength > 5 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "Arquivo muito grande (máx 5MB)" }), {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const id = `${folder}_${crypto.randomUUID()}`;
        const mime = file.type || "image/jpeg";

        await env.UBA_STORAGE.put(`img:${id}`, body, {
          metadata: { contentType: mime }
        });

        const viewerUrl = `${url.origin}/view/${id}`;
        return new Response(JSON.stringify({ data: { url: viewerUrl }, url: viewerUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("Erro no /images/upload:", err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // --- ENDPOINT DE UPLOAD (legado, raw binary) ---
    if (path === "/upload" && request.method === "POST") {
      try {
        const urlParams = new URL(request.url).searchParams;
        const customId = urlParams.get("customId");
        const contentType = request.headers.get("Content-Type") || "image/jpeg";
        const body = await request.arrayBuffer();

        if (body.byteLength > 2 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "Imagem muito grande (máx 2MB)" }), {
            status: 413,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const id = customId || crypto.randomUUID();
        const mime = contentType.split(";")[0] || "image/jpeg";

        await env.UBA_STORAGE.put(`img:${id}`, body, {
          metadata: { contentType: mime }
        });

        const viewerUrl = `${url.origin}/view/${id}`;
        return new Response(JSON.stringify({ url: viewerUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // --- ENDPOINT DE VISUALIZAÇÃO ---
    if (path.startsWith("/view/")) {
      const id = path.split("/view/")[1];
      const { value, metadata } = await env.UBA_STORAGE.getWithMetadata(`img:${id}`, { type: "arrayBuffer" });

      if (!value) {
        return new Response("Not Found", { status: 404 });
      }

      return new Response(value, {
        headers: {
          "Content-Type": metadata?.contentType || "image/jpeg",
          "Cache-Control": "public, max-age=31536000",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // --- ENDPOINTS ASAAS / FINANCEIRO ---
    if (path.startsWith("/customers-by-cpf/") && request.method === "GET") {
      try {
        const cpf = path.split("/customers-by-cpf/")[1]?.replace(/\D/g, "");
        const customers = await asaasJson(env, `/customers?cpfCnpj=${encodeURIComponent(cpf || "")}`);
        const list = customers.data || [];

        if (!list.length) {
          return jsonResponse({ success: false, error: "Cliente não encontrado", customers: [] }, 404, corsHeaders);
        }

        return jsonResponse({ success: true, customer: list[0], customers: list }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    if (path === "/create-payment" && request.method === "POST") {
      try {
        const payload = await request.json();
        const customer = payload.customer || await ensureAsaasCustomer(env, payload);
        const paymentPayload = buildAsaasPaymentPayload(payload, customer);
        const payment = await asaasJson(env, "/payments", {
          method: "POST",
          body: JSON.stringify(paymentPayload)
        });

        const enrichedPayment = await enrichPixPayment(env, payment);
        return jsonResponse({ success: true, payment: enrichedPayment }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    if (path === "/generate-carnet" && request.method === "POST") {
      try {
        const payload = await request.json();
        const customer = payload.customer || await ensureAsaasCustomer(env, payload);
        const payments = await createCarnetPayments(env, payload, customer);
        return jsonResponse({ success: true, payments }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    if (path === "/payment-status" && request.method === "GET") {
      try {
        const paymentId = url.searchParams.get("paymentId");
        if (!paymentId) return jsonResponse({ success: false, error: "paymentId obrigatório" }, 400, corsHeaders);
        const payment = await asaasJson(env, `/payments/${encodeURIComponent(paymentId)}`);
        return jsonResponse({ success: true, payment }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    if (path === "/finance/balance" && request.method === "GET") {
      try {
        const balance = await asaasJson(env, "/finance/balance");
        return jsonResponse({ success: true, ...balance }, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    if (path === "/payments" && request.method === "GET") {
      try {
        const paymentList = await asaasJson(env, `/payments${url.search || ""}`);
        return jsonResponse(paymentList, 200, corsHeaders);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    if (path.startsWith("/payments/")) {
      try {
        const parts = path.split("/").filter(Boolean);
        const paymentId = parts[1];
        const action = parts[2];

        if (!paymentId) {
          return jsonResponse({ success: false, error: "ID da fatura obrigatório" }, 400, corsHeaders);
        }

        if (action === "receive-in-cash" && request.method === "POST") {
          const body = await request.json();
          const paid = await asaasJson(env, `/payments/${encodeURIComponent(paymentId)}/receiveInCash`, {
            method: "POST",
            body: JSON.stringify({
              paymentDate: body.paymentDate || new Date().toISOString().split("T")[0],
              value: normalizeCurrencyValue(body.value),
              notifyCustomer: body.notify === true
            })
          });
          return jsonResponse({ success: true, payment: paid }, 200, corsHeaders);
        }

        if (request.method === "GET") {
          const payment = await asaasJson(env, `/payments/${encodeURIComponent(paymentId)}`);
          return jsonResponse({ success: true, payment }, 200, corsHeaders);
        }

        if (request.method === "PUT") {
          const body = await request.json();
          const updated = await asaasJson(env, `/payments/${encodeURIComponent(paymentId)}`, {
            method: "PUT",
            body: JSON.stringify(normalizePaymentUpdate(body))
          });
          return jsonResponse({ success: true, payment: updated }, 200, corsHeaders);
        }

        if (request.method === "DELETE") {
          const deleted = await asaasJson(env, `/payments/${encodeURIComponent(paymentId)}`, {
            method: "DELETE"
          });
          return jsonResponse({ success: true, deleted }, 200, corsHeaders);
        }
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500, corsHeaders);
      }
    }

    // --- PROXY PARA EVOLUTION API ---
    try {
      let targetUrl = `${EVOLUTION_URL}${path}${url.search || ""}`;
      if (path === "/send") targetUrl = `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`;

      const headers = new Headers();
      headers.set("apikey", env.EVOLUTION_API_KEY || request.headers.get("apikey") || "");
      headers.set("Content-Type", "application/json");

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: METHODS_WITH_BODY.has(request.method) ? await request.text() : undefined,
      });

      // Se a resposta for JSON, vamos tentar garantir que chegue limpa
      const contentType = response.headers.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        const json = await response.json();
        return new Response(JSON.stringify(json), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Para outros tipos (ou se falhar o json), respondemos o original mas sem compressão forçada
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        headers: { 
          ...corsHeaders, 
          "Content-Type": contentType || "application/json" 
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Proxy Error: " + err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  },

  // --- PROCESSADOR DE FILA E AUTOMAÇÃO (CRON) ---
  async scheduled(event, env, ctx) {
    // 1. Processa Fila de Mensagens Pendentes (Cron a cada 1 min)
    await processQueue(env);
    
    // 2. Processa Automação de Aniversários
    await processBirthdays(env);

    // 3. Processa o Resumo Diário ao Administrador (horário configurável)
    await handleDailySummaryFlow(env);

    // 4. Processa os Lembretes de Pagamento aos Responsáveis (horário configurável)
    await handlePaymentReminderFlow(env);
  }
};

/**
 * Gerencia o disparo automático do resumo diário ao administrador, respeitando o
 * horário configurado (dailySummaryTime). Sempre resume o dia ANTERIOR completo
 * (00:00 às 23:59), já que só roda depois que esse dia já terminou de verdade.
 */
async function handleDailySummaryFlow(env) {
  try {
    const config = await fetchAdminNotificationsConfig(env);
    if (!config.dailySummaryEnabled || !config.adminPhone) return;

    const nowParts = spDateParts(spNow());
    const sendTime = config.dailySummaryTime || "09:00";
    const lastRun = await env.UBA_STORAGE.get(`daily_summary_run:${nowParts.dateStr}`);

    if (nowParts.timeStr >= sendTime && !lastRun) {
      const targetDateStr = yesterdayStr(nowParts.dateStr);
      await sendDailySummary(env, { dateStr: targetDateStr, phone: config.adminPhone });
      await env.UBA_STORAGE.put(`daily_summary_run:${nowParts.dateStr}`, "done", { expirationTtl: 86400 * 7 });
    }
  } catch (e) {
    console.error("Erro no fluxo do resumo diário:", e);
  }
}

// --- Helpers de data/hora no fuso de São Paulo (mesmo truque de deslocar -3h já usado
// no fluxo financeiro acima, sem depender de Intl/timeZone dentro do Worker). ---
function spNow() {
  return new Date(Date.now() - 3 * 3600 * 1000);
}

function spDateParts(spShiftedDate) {
  const y = spShiftedDate.getUTCFullYear();
  const m = String(spShiftedDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(spShiftedDate.getUTCDate()).padStart(2, "0");
  const hh = String(spShiftedDate.getUTCHours()).padStart(2, "0");
  const mm = String(spShiftedDate.getUTCMinutes()).padStart(2, "0");
  return { dateStr: `${y}-${m}-${d}`, timeStr: `${hh}:${mm}` };
}

function yesterdayStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().split("T")[0];
}

function ymdToDisplay(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function fsFieldValue(field) {
  if (!field) return undefined;
  if ("stringValue" in field) return field.stringValue;
  if ("doubleValue" in field) return field.doubleValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("booleanValue" in field) return field.booleanValue;
  return undefined;
}

function normalizeAdminPhoneServer(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function formatBRLServer(value) {
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseLocalDateStrServer(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

async function fetchAdminNotificationsConfig(env) {
  const fallback = {
    adminPhone: "", dailySummaryEnabled: false, dailySummaryTime: "09:00",
    redirectParentMessagesToAdmin: true,
    paymentReminderBeforeEnabled: false, paymentReminderBeforeDays: 3,
    paymentReminderOnDayEnabled: false,
    paymentReminderAfterEnabled: false, paymentReminderAfterDays: 5,
    paymentReminderSendTime: "09:00", paymentReminderSendEndTime: "18:00", paymentReminderIntervalSeconds: 5,
  };
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/system_settings/admin_notifications?key=${env.FIREBASE_API_KEY}`);
  if (!res.ok) return fallback;
  const doc = await res.json();
  const f = doc.fields || {};
  return {
    adminPhone: f.adminPhone?.stringValue || "",
    notifyOnRegistration: f.notifyOnRegistration?.booleanValue || false,
    notifyOnPayment: f.notifyOnPayment?.booleanValue || false,
    dailySummaryEnabled: f.dailySummaryEnabled?.booleanValue || false,
    dailySummaryTime: f.dailySummaryTime?.stringValue || "09:00",
    // Toggle de segurança global: enquanto true, TODO envio que seria destinado a um
    // responsável (lembretes de pagamento + confirmação de pagamento identificado) é
    // redirecionado para o número do admin. Nunca deve ser ignorado - ver resolveParentPhone.
    redirectParentMessagesToAdmin: f.redirectParentMessagesToAdmin?.booleanValue !== false,
    paymentReminderBeforeEnabled: f.paymentReminderBeforeEnabled?.booleanValue || false,
    paymentReminderBeforeDays: f.paymentReminderBeforeDays?.integerValue !== undefined ? Number(f.paymentReminderBeforeDays.integerValue) : 3,
    paymentReminderOnDayEnabled: f.paymentReminderOnDayEnabled?.booleanValue || false,
    paymentReminderAfterEnabled: f.paymentReminderAfterEnabled?.booleanValue || false,
    paymentReminderAfterDays: f.paymentReminderAfterDays?.integerValue !== undefined ? Number(f.paymentReminderAfterDays.integerValue) : 5,
    paymentReminderSendTime: f.paymentReminderSendTime?.stringValue || "09:00",
    paymentReminderSendEndTime: f.paymentReminderSendEndTime?.stringValue || "18:00",
    paymentReminderIntervalSeconds: f.paymentReminderIntervalSeconds?.integerValue !== undefined ? Number(f.paymentReminderIntervalSeconds.integerValue) : 5,
  };
}

/**
 * Único ponto de decisão de destino para QUALQUER mensagem que iria pra um responsável
 * (lembretes de pagamento e confirmação de pagamento identificado). Enquanto o toggle de
 * segurança estiver ligado, SEMPRE redireciona pro admin - nenhum código deve contornar isso.
 */
function resolveParentPhone(config, realPhone) {
  if (config.redirectParentMessagesToAdmin) {
    return { phone: normalizeAdminPhoneServer(config.adminPhone), redirected: true };
  }
  return { phone: normalizeAdminPhoneServer(realPhone), redirected: false };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Envio imediato (fora da fila KV) pro responsável, usando a MESMA instância/número do hub
 * já usada pelos avisos ao admin (não a antiga Evolution API direta, que fica desconectada). */
async function sendParentMessage(env, phone, text) {
  const result = await sendHubMessageServer(env, phone, text, undefined);
  if (result.success) return { success: true };
  return { success: false, error: result.error || result.body?.error || "Falha ao enviar via hub." };
}

// --- Webhook do Asaas: fonte de verdade automática do "pagamento identificado" ---

async function fetchFirestoreDoc(env, collectionId, docId) {
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionId}/${docId}?key=${env.FIREBASE_API_KEY}`);
  if (!res.ok) return null;
  return res.json();
}

/** PATCH com updateMask = merge (igual ao `{merge:true}` do SDK client), sem apagar
 * outros campos do documento. */
async function upsertFirestoreDoc(env, collectionId, docId, fields) {
  const maskParams = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionId}/${docId}?key=${env.FIREBASE_API_KEY}&${maskParams}`;
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
}

async function fetchRemainingDebtsForStudent(env, studentId) {
  const q = {
    structuredQuery: {
      from: [{ collectionId: "financial_payments" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "studentId" }, op: "EQUAL", value: { stringValue: studentId } } },
            { fieldFilter: { field: { fieldPath: "status" }, op: "IN", value: { arrayValue: { values: [{ stringValue: "PENDING" }, { stringValue: "OVERDUE" }] } } } }
          ]
        }
      },
      limit: 50
    }
  };
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(q)
  });
  if (!res.ok) return [];
  const data = await res.json();
  const items = data.filter(i => i.document).map(i => {
    const f = i.document.fields || {};
    return {
      description: fsFieldValue(f.description) || "Mensalidade",
      dueDate: fsFieldValue(f.dueDate) || "",
      isOverdue: fsFieldValue(f.status) === "OVERDUE",
    };
  });
  items.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  return items;
}

function ymdToDisplayFlexible(dateStr) {
  if (!dateStr) return "não informado";
  const ymd = dateStr.substring(0, 10);
  const parts = ymd.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

function buildPaymentWebhookText({ nome, modalidade, payerNome, payment, remaining }) {
  const paidDateStr = payment.paymentDate || payment.clientPaymentDate || payment.dueDate;
  let situacao = "";
  if (payment.dueDate && paidDateStr) {
    const due = new Date(payment.dueDate.substring(0, 10) + "T00:00:00");
    const paid = new Date(paidDateStr.substring(0, 10) + "T00:00:00");
    if (!isNaN(due.getTime()) && !isNaN(paid.getTime())) {
      const late = Math.round((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      situacao = late > 0 ? `Pago com ${late} dia${late === 1 ? "" : "s"} de atraso` : "Pago em dia";
    }
  }

  const lines = [];
  lines.push("✅ *PAGAMENTO IDENTIFICADO*");
  lines.push("");
  lines.push(`Pagador: *${(payerNome || "Responsável").toUpperCase()}*`);
  lines.push(`Referente a: *${(nome || "Aluno").toUpperCase()}*${modalidade ? ` · ${modalidade.toUpperCase()}` : ""}`);
  if (situacao) lines.push(`Situação: *${situacao.toUpperCase()}*`);
  lines.push(`Referência: *${payment.description || "Mensalidade"}*`);
  lines.push(`Forma de pagamento: *${billingTypeLabelServer(payment.billingType)}*`);
  lines.push(`Vencimento: *${ymdToDisplayFlexible(payment.dueDate)}*`);
  lines.push(`Pago em: *${ymdToDisplayFlexible(paidDateStr)}*`);
  lines.push(`Valor pago: *${formatBRLServer(payment.value)}*`);

  if (remaining.length === 0) {
    lines.push("");
    lines.push("✅ *SEM PENDÊNCIAS RESTANTES*");
  } else {
    lines.push("");
    lines.push(`*PENDÊNCIAS RESTANTES (${remaining.length}):*`);
    remaining.slice(0, 3).forEach(d => {
      lines.push(`- ${d.description}${d.isOverdue ? " (atrasada)" : ""} - venc. ${ymdToDisplayFlexible(d.dueDate)}`);
    });
    if (remaining.length > 3) lines.push(`+ ${remaining.length - 3} outras`);
  }

  return lines.join("\n");
}

function billingTypeLabelServer(billingType) {
  const bt = (billingType || "").toUpperCase();
  if (bt === "PIX") return "PIX";
  if (bt === "BOLETO") return "Boleto";
  if (bt === "CREDIT_CARD") return "Cartão";
  return billingType || "Não informado";
}

/** Recebe o objeto `payment` cru da Asaas (via webhook), descobre a qual aluno ele pertence,
 * atualiza o cache do Firestore (mesmo sem nenhum cliente ter sincronizado) e dispara os
 * avisos (admin + responsável), sem depender de ninguém ter aberto o app. */
async function processAsaasPaymentWebhook(env, payment) {
  // 1. Descobre o studentId - primeiro tenta o cache já existente do próprio pagamento,
  // depois cai pro externalReference (formato "<registrationId>_...").
  let studentId = null;
  const cachedDoc = await fetchFirestoreDoc(env, "financial_payments", payment.id);
  if (cachedDoc?.fields?.studentId?.stringValue) {
    studentId = cachedDoc.fields.studentId.stringValue;
  } else if (payment.externalReference) {
    const candidateId = payment.externalReference.split("_")[0];
    const regDoc = await fetchFirestoreDoc(env, "uba_2026_registrations", candidateId);
    if (regDoc) studentId = candidateId;
  }

  if (!studentId) {
    console.warn("[AsaasWebhook] Não foi possível identificar o aluno do pagamento", payment.id);
    return { success: true, notified: false, reason: "student_not_found" };
  }

  // 2. Atualiza o cache do pagamento no Firestore (mesmo formato usado pelo SyncService).
  await upsertFirestoreDoc(env, "financial_payments", payment.id, {
    id: { stringValue: payment.id },
    studentId: { stringValue: studentId },
    customer: { stringValue: payment.customer || "" },
    value: { doubleValue: payment.value || 0 },
    dueDate: { stringValue: payment.dueDate || "" },
    status: { stringValue: payment.status || "" },
    description: { stringValue: payment.description || "" },
    billingType: { stringValue: payment.billingType || "" },
    paymentDate: { stringValue: payment.paymentDate || payment.clientPaymentDate || "" },
    externalReference: { stringValue: payment.externalReference || "" },
    lastUpdate: { stringValue: new Date().toISOString() },
  });

  // 3. Busca dados do aluno/responsável.
  const regDoc = await fetchFirestoreDoc(env, "uba_2026_registrations", studentId);
  if (!regDoc) return { success: true, notified: false, reason: "registration_not_found" };
  const regFields = regDoc.fields || {};
  const alunoFields = regFields.alunos?.arrayValue?.values?.[0]?.mapValue?.fields || {};
  const nome = fsFieldValue(alunoFields.nome) || "Aluno";
  const modalidade = fsFieldValue(regFields.modalidade) || "";
  const responsavelFields = regFields.responsavel?.mapValue?.fields || {};
  const payerNome = fsFieldValue(responsavelFields.nome) || "Responsável";
  const responsavelPhone = fsFieldValue(responsavelFields.telefonePrincipal) || "";

  // 4. Pendências restantes (o próprio pagamento já mudou de status, então some da lista sozinho).
  const remaining = await fetchRemainingDebtsForStudent(env, studentId);

  // 5. Aviso ao admin (imagem estática + texto rico, pra não depender de Canvas no Worker).
  const config = await fetchAdminNotificationsConfig(env);
  let notifiedAdmin = false;
  if (config.notifyOnPayment && config.adminPhone) {
    const text = buildPaymentWebhookText({ nome, modalidade, payerNome, payment, remaining });
    const imageUrl = `data:image/jpeg;base64,${PAGAMENTO_JPEG_BASE64}`;
    const sendResult = await sendHubMessageServer(env, normalizeAdminPhoneServer(config.adminPhone), text, imageUrl);
    notifiedAdmin = sendResult.success;
  }

  // 6. Confirmação ao responsável (sempre passando pelo toggle de redirecionamento).
  if (responsavelPhone) {
    const valorTexto = typeof payment.value === "number" ? ` no valor de *${formatBRLServer(payment.value)}*` : "";
    const parentText = `✅ *PAGAMENTO CONFIRMADO*\n\nOlá! Confirmamos o recebimento do seu pagamento${valorTexto}, referente ao(à) aluno(a) *${nome.toUpperCase()}*.\n\nObrigado por manter a mensalidade em dia! 🙌`;
    const { phone: destino } = resolveParentPhone(config, responsavelPhone);
    await sendParentMessage(env, destino, parentText);
  }

  return { success: true, notified: notifiedAdmin, studentId };
}

function parseFlexibleDate(dStr) {
  if (!dStr) return null;
  if (dStr.includes("/")) {
    const [d, m, y] = dStr.split("/");
    return new Date(`${y}-${m}-${d}T12:00:00`);
  }
  return new Date(dStr + "T12:00:00");
}

/** Busca faturas PENDING/OVERDUE e classifica pela regra (BEFORE/ONDAY/AFTER) batendo com os
 * dias configurados, pra uma data de referência arbitrária (produção usa hoje; teste pode
 * simular outro dia). */
async function findMatchingPaymentReminders(env, virtualTodayStr, config) {
  const paymentsQuery = {
    structuredQuery: {
      from: [{ collectionId: "financial_payments" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "IN",
          value: { arrayValue: { values: [{ stringValue: "PENDING" }, { stringValue: "OVERDUE" }] } }
        }
      },
      limit: 1000
    }
  };
  const payRes = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paymentsQuery)
  });
  if (!payRes.ok) return [];
  const payData = await payRes.json();

  const today = parseFlexibleDate(virtualTodayStr);
  const activePayments = [];
  for (const item of payData) {
    if (!item.document) continue;
    const fields = item.document.fields || {};
    const dueDateStr = fsFieldValue(fields.dueDate) || "";
    const studentId = fsFieldValue(fields.studentId) || "";
    const invoiceUrl = fsFieldValue(fields.invoiceUrl) || "";
    const description = fsFieldValue(fields.description) || "Mensalidade";
    if (!dueDateStr || !studentId) continue;

    const due = parseFlexibleDate(dueDateStr);
    if (!due || isNaN(due.getTime()) || !today || isNaN(today.getTime())) continue;

    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let ruleMatched = null;
    if (diffDays <= config.paymentReminderBeforeDays && diffDays > 0 && config.paymentReminderBeforeEnabled) ruleMatched = "BEFORE";
    else if (diffDays === 0 && config.paymentReminderOnDayEnabled) ruleMatched = "ONDAY";
    else if (diffDays <= -config.paymentReminderAfterDays && diffDays < 0 && config.paymentReminderAfterEnabled) ruleMatched = "AFTER";

    if (ruleMatched) {
      activePayments.push({
        paymentId: item.document.name.split("/").pop(),
        studentId, dueDateStr, invoiceUrl, description, ruleMatched, diffDays
      });
    }
  }
  return activePayments;
}

function buildPaymentReminderText(p, studentName) {
  const dueDateDisplay = p.dueDateStr.split("-").reverse().join("/");
  const manualMsg = "\n\nPara regularizar seu pagamento, por favor, entre em contato via WhatsApp com a nossa secretaria acadêmica ou utilize a Chave PIX da escola.";
  const linkLine = p.invoiceUrl ? `\n\n*Clique no link abaixo para pagar:*\n🔗 ${p.invoiceUrl}` : manualMsg;

  if (p.ruleMatched === "BEFORE") {
    return `Olá! Peço licença para enviar um lembrete preventivo: a cobrança de *${p.description}* do(a) aluno(a) *${studentName}* vence em breve (dia ${dueDateDisplay}).${linkLine}\n\nObrigado por fortalecer nosso esporte!`;
  }
  if (p.ruleMatched === "ONDAY") {
    return `Informamos que hoje é o vencimento da cobrança (*${p.description}*) do(a) aluno(a) *${studentName}*.\n\nCaso já tenha efetuado o pagamento, desconsidere este aviso.${linkLine}`;
  }
  const diasAtraso = Math.abs(p.diffDays);
  return `Olá! Consta em nosso sistema que a cobrança (*${p.description}*) do(a) aluno(a) *${studentName}* está vencida há ${diasAtraso} dias (vencimento em ${dueDateDisplay}).${linkLine}`;
}

async function fetchApprovedStudentsMap(env) {
  const docs = await fetchAllDocs(env, "uba_2026_registrations");
  const map = {};
  for (const d of docs) {
    const id = d.name.split("/").pop();
    map[id] = d.fields || {};
  }
  return map;
}

function studentInfoFromFields(fields) {
  const phoneRaw = fields.responsavel?.mapValue?.fields?.telefonePrincipal?.stringValue || "";
  const alunoFields = fields.alunos?.arrayValue?.values?.[0]?.mapValue?.fields || {};
  const fullName = (alunoFields.nome?.stringValue || "Aluno").trim();
  const fotoUrl = alunoFields.fotoUrl?.stringValue || "";
  const nome = fullName.split(" ")[0];
  const contractStatus = fsFieldValue(fields.contractStatus) || "pendente";
  return { phoneRaw, nome, fullName, fotoUrl, contractStatus };
}

/**
 * Roda o lote de lembretes de pagamento (produção, todas as faturas que baterem com as
 * regras habilitadas) ou um único teste isolado (uma regra, um aluno real aleatório).
 * Sempre passa pelo resolveParentPhone - o toggle de segurança nunca é contornado aqui.
 */
async function runPaymentReminderBatch(env, { virtualTodayStr, config, isTest = false, onlyRule = null }) {
  const activePayments = await findMatchingPaymentReminders(env, virtualTodayStr, config);
  const filtered = onlyRule ? activePayments.filter(p => p.ruleMatched === onlyRule) : activePayments;
  if (filtered.length === 0) return { count: 0, sample: null };

  const studentsMap = await fetchApprovedStudentsMap(env);

  // Só usa alunos com contrato aprovado (não cancelado, não pendente) e telefone cadastrado.
  const eligible = [];
  for (const p of filtered) {
    const fields = studentsMap[p.studentId];
    if (!fields) continue;
    const info = studentInfoFromFields(fields);
    if (info.contractStatus !== "aprovado" || !info.phoneRaw) continue;
    eligible.push({ p, info });
  }
  if (eligible.length === 0) return { count: 0, sample: null };

  let toProcess = eligible;
  let sample = null;

  if (isTest) {
    // Teste isolado: escolhe UM aluno real aprovado aleatório entre os elegíveis.
    const pick = eligible[Math.floor(Math.random() * eligible.length)];
    toProcess = [pick];
  }

  let countSent = 0;
  let stoppedByEndTime = false;
  for (let i = 0; i < toProcess.length; i++) {
    // Fora do horário comercial configurado, o lote de PRODUÇÃO para (não manda mais nada
    // hoje). O teste manual isolado ignora esse limite - é uma ação explícita do admin.
    if (!isTest && config.paymentReminderSendEndTime) {
      const currentTimeStr = spDateParts(spNow()).timeStr;
      if (currentTimeStr > config.paymentReminderSendEndTime) {
        stoppedByEndTime = true;
        break;
      }
    }

    const { p, info } = toProcess[i];
    const kvKey = isTest
      ? `payment_reminder_test_sent:${p.paymentId}:${p.ruleMatched}`
      : `payment_reminder_sent:${p.paymentId}:${p.ruleMatched}`;
    const alreadySent = await env.UBA_STORAGE.get(kvKey);
    if (alreadySent && !isTest) continue;

    const text = buildPaymentReminderText(p, info.nome);
    const { phone, redirected } = resolveParentPhone(config, info.phoneRaw);
    const result = await sendParentMessage(env, phone, text);

    if (result.success) {
      await env.UBA_STORAGE.put(kvKey, "true", { expirationTtl: 86400 * 30 });
      countSent++;
    }
    if (isTest) sample = { text, studentName: info.nome, rule: p.ruleMatched, redirected, sent: result.success, sendError: result.error };

    await logPaymentReminderSend(env, {
      studentId: p.studentId, studentName: info.fullName, studentPhoto: info.fotoUrl,
      rule: p.ruleMatched, phone, redirected, success: result.success, isTest,
    });

    if (!isTest && config.paymentReminderIntervalSeconds > 0 && i < toProcess.length - 1) {
      await sleep(config.paymentReminderIntervalSeconds * 1000);
    }
  }
  if (stoppedByEndTime) {
    console.log(`[Lembretes] Horário limite (${config.paymentReminderSendEndTime}) atingido - ${countSent}/${toProcess.length} enviados, restante fica pro próximo dia.`);
  }
  return { count: countSent, sample };
}

/** Registra cada lembrete de pagamento realmente disparado (nome + foto do aluno) pra
 * alimentar a aba de Histórico da página de Avisos ao Administrador. */
async function logPaymentReminderSend(env, { studentId, studentName, studentPhoto, rule, phone, redirected, success, isTest }) {
  try {
    const fields = {
      studentId: { stringValue: studentId || "" },
      studentName: { stringValue: studentName || "" },
      rule: { stringValue: rule || "" },
      phone: { stringValue: phone || "" },
      redirected: { booleanValue: !!redirected },
      success: { booleanValue: !!success },
      isTest: { booleanValue: !!isTest },
      sentAt: { timestampValue: new Date().toISOString() },
    };
    if (studentPhoto) fields.studentPhoto = { stringValue: studentPhoto };

    await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/payment_reminder_logs?key=${env.FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields })
    });
  } catch (e) {
    console.error("Erro ao registrar log de lembrete de pagamento:", e);
  }
}

/**
 * Disparo automático diário dos lembretes de pagamento, respeitando o horário configurado.
 * Roda sempre para o dia de HOJE (não "ontem" como o resumo), pois BEFORE/ONDAY/AFTER
 * dependem da data de vencimento comparada a hoje.
 */
async function handlePaymentReminderFlow(env) {
  try {
    const config = await fetchAdminNotificationsConfig(env);
    const anyEnabled = config.paymentReminderBeforeEnabled || config.paymentReminderOnDayEnabled || config.paymentReminderAfterEnabled;
    if (!anyEnabled) return;

    const nowParts = spDateParts(spNow());
    const sendTime = config.paymentReminderSendTime || "09:00";
    const endTime = config.paymentReminderSendEndTime || "18:00";
    const lastRun = await env.UBA_STORAGE.get(`payment_reminder_run:${nowParts.dateStr}`);

    if (nowParts.timeStr >= sendTime && nowParts.timeStr <= endTime && !lastRun) {
      await env.UBA_STORAGE.put(`payment_reminder_run:${nowParts.dateStr}`, "done", { expirationTtl: 86400 * 7 });
      await runPaymentReminderBatch(env, { virtualTodayStr: nowParts.dateStr, config, isTest: false });
    }
  } catch (e) {
    console.error("Erro no fluxo de lembretes de pagamento:", e);
  }
}

async function fetchAllDocs(env, collectionId, pageSize = 500) {
  const docs = [];
  let pageToken;
  do {
    const pageUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionId}?key=${env.FIREBASE_API_KEY}&pageSize=${pageSize}`
      + (pageToken ? `&pageToken=${pageToken}` : "");
    const res = await fetch(pageUrl);
    if (!res.ok) break;
    const data = await res.json();
    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return docs;
}

async function fetchDailyEventsForDate(env, type, dateStr) {
  const q = {
    structuredQuery: {
      from: [{ collectionId: "uba_2026_daily_events" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "dateStr" }, op: "EQUAL", value: { stringValue: dateStr } } },
            { fieldFilter: { field: { fieldPath: "type" }, op: "EQUAL", value: { stringValue: type } } }
          ]
        }
      },
      limit: 1000
    }
  };
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery?key=${env.FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(q)
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.filter(item => item.document).map(item => {
    const fields = item.document.fields || {};
    return {
      nome: fsFieldValue(fields.nome) || "",
      horario: fsFieldValue(fields.horario) || "",
      valor: fsFieldValue(fields.valor) ?? null,
    };
  });
}

const DAILY_SUMMARY_PAID_STATUSES = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "pago", "confirmado"];

/** Mesma agregação do AdminStats/adminNotifications.ts (cliente), só que rodando no Worker
 * pro cron poder disparar sem depender de um navegador aberto. Usa o mês do dia alvo
 * (não "hoje"), pra virada de mês não misturar o mês errado num resumo de "ontem". */
async function fetchMonthlyFinancialsServer(env, targetDateStr) {
  const target = parseLocalDateStrServer(targetDateStr) || new Date();
  const year = target.getFullYear();
  const month = target.getMonth();
  const isThisMonth = (d) => !!d && d.getFullYear() === year && d.getMonth() === month;

  const docs = await fetchAllDocs(env, "financial_payments");
  let receivedThisMonth = 0;
  let pendingThisMonth = 0;

  for (const doc of docs) {
    const fields = doc.fields || {};
    const status = fsFieldValue(fields.status);
    if (["DELETED", "REFUNDED", "REMOVED_BY_RECEIVER"].includes(status)) continue;

    const externalReference = fsFieldValue(fields.externalReference) || "";
    const description = (fsFieldValue(fields.description) || "").toLowerCase();
    const isManual = externalReference.startsWith("MANUAL_") || description.includes("uniforme") || description.includes("kit");
    const value = fsFieldValue(fields.value) || 0;

    if (DAILY_SUMMARY_PAID_STATUSES.includes(status)) {
      const paidDateStr = fsFieldValue(fields.paymentDate) || fsFieldValue(fields.dateCreated) || fsFieldValue(fields.lastUpdate);
      const paidDate = parseLocalDateStrServer(paidDateStr);
      if (isThisMonth(paidDate)) receivedThisMonth += value;
    } else if (!isManual) {
      const due = parseLocalDateStrServer(fsFieldValue(fields.dueDate));
      if (isThisMonth(due)) pendingThisMonth += value;
    }
  }

  return { receivedThisMonth, pendingThisMonth };
}

async function fetchCaixaAtualServer(env) {
  try {
    const balance = await asaasJson(env, "/finance/balance");
    if (typeof balance.balance === "number") return balance.balance;
    if (typeof balance.value === "number") return balance.value;
    return null;
  } catch (e) {
    return null;
  }
}

function getDailySummaryImageDataUri() {
  return `data:image/jpeg;base64,${RESUMO_ADMIN_JPEG_BASE64}`;
}

/** Monta o texto do resumo diário pra uma data arbitrária (YYYY-MM-DD). */
async function buildDailySummaryText(env, dateStr) {
  const [caixa, monthly, registrations, payments] = await Promise.all([
    fetchCaixaAtualServer(env),
    fetchMonthlyFinancialsServer(env, dateStr),
    fetchDailyEventsForDate(env, "registration", dateStr),
    fetchDailyEventsForDate(env, "payment", dateStr),
  ]);

  const payersSorted = [...payments].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  const dateDisplay = ymdToDisplay(dateStr);

  const lines = [];
  lines.push(`📊 *RESUMO DIÁRIO - ${dateDisplay}*`);
  lines.push("");
  lines.push(`CAIXA ATUAL: *${caixa !== null ? formatBRLServer(caixa) : "INDISPONÍVEL"}*`);
  lines.push(`A RECEBER ESTE MÊS: *${formatBRLServer(monthly.pendingThisMonth)}*`);
  lines.push(`JÁ RECEBIDO ESTE MÊS: *${formatBRLServer(monthly.receivedThisMonth)}*`);
  lines.push("");
  lines.push(`NOVOS CADASTROS: *${registrations.length}*`);
  lines.push(`PAGAMENTOS RECEBIDOS: *${payersSorted.length}*`);

  if (payersSorted.length > 0) {
    lines.push("");
    lines.push("*QUEM PAGOU:*");
    payersSorted.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.horario} - ${(p.nome || "").toUpperCase()}`);
    });
  }

  return lines.join("\n");
}

async function sendHubMessageServer(env, to, text, imageUrl) {
  if (!env.WHATSAPP_HUB || !env.WHATSAPP_HUB_API_KEY) {
    return { success: false, error: "WhatsApp Hub não configurado." };
  }
  try {
    const hubRes = await env.WHATSAPP_HUB.fetch("https://whatsapp-hub.internal/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.WHATSAPP_HUB_API_KEY}` },
      body: JSON.stringify({ to, text, imageUrl })
    });
    const body = await hubRes.json().catch(() => ({}));
    return { success: hubRes.ok, body };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Monta e envia o resumo diário (usado tanto pelo cron quanto pelo botão de teste manual). */
async function sendDailySummary(env, { dateStr, phone } = {}) {
  const config = await fetchAdminNotificationsConfig(env);
  const targetPhone = normalizeAdminPhoneServer(phone || config.adminPhone);
  if (!targetPhone) return { success: false, error: "Telefone do administrador não configurado." };

  const text = await buildDailySummaryText(env, dateStr);
  const imageUrl = getDailySummaryImageDataUri();
  const result = await sendHubMessageServer(env, targetPhone, text, imageUrl);
  return { success: result.success, text, error: result.error || result.body?.error };
}

/**
 * Gerencia o fluxo da automação financeira (Diário + Agendamento de Teste)
 */
function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function asaasJson(env, path, options = {}) {
  const apiKey = env.ASAAS_API_KEY;
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurada no Worker.");

  const response = await fetch(`${ASAAS_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "access_token": apiKey,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    data = { raw: text };
  }

  if (!response.ok) {
    const msg = data.errors?.[0]?.description || data.error || data.message || `Asaas retornou ${response.status}`;
    throw new Error(msg);
  }

  return data;
}

function normalizeCurrencyValue(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return number > 1000 ? Math.round(number) / 100 : number;
}

function normalizePaymentUpdate(body) {
  const update = { ...body };
  if (update.amount !== undefined && update.value === undefined) {
    update.value = normalizeCurrencyValue(update.amount);
    delete update.amount;
  }
  if (update.value !== undefined) update.value = normalizeCurrencyValue(update.value);
  return update;
}

function normalizePhone(phone) {
  const clean = String(phone || "").replace(/\D/g, "");
  if (!clean) return undefined;
  return clean.length > 11 && clean.startsWith("55") ? clean.substring(2) : clean;
}

async function ensureAsaasCustomer(env, payload) {
  const cpf = String(payload.responsibleCpf || payload.cpf || "").replace(/\D/g, "");
  if (cpf) {
    const existing = await asaasJson(env, `/customers?cpfCnpj=${encodeURIComponent(cpf)}`);
    if (existing.data?.[0]?.id) return existing.data[0].id;
  }

  const customer = await asaasJson(env, "/customers", {
    method: "POST",
    body: JSON.stringify({
      name: payload.responsibleName || payload.name || "Responsável UBA",
      cpfCnpj: cpf || undefined,
      email: payload.responsibleEmail || payload.email || undefined,
      mobilePhone: normalizePhone(payload.responsiblePhone || payload.phone),
      notificationDisabled: true
    })
  });

  return customer.id;
}

function buildAsaasPaymentPayload(payload, customer) {
  const payment = {
    customer,
    billingType: payload.billingType || "PIX",
    value: normalizeCurrencyValue(payload.amount ?? payload.value),
    dueDate: payload.dueDate || new Date().toISOString().split("T")[0],
    description: payload.description || "Cobrança UBA",
    externalReference: payload.externalReference || payload.registrationId || undefined
  };

  if (payload.discount) payment.discount = payload.discount;
  if (payload.fine) payment.fine = payload.fine;
  if (payload.interest) payment.interest = payload.interest;
  if (payload.installmentCount) payment.installmentCount = payload.installmentCount;
  if (payload.installmentValue) payment.installmentValue = normalizeCurrencyValue(payload.installmentValue);

  return payment;
}

async function enrichPixPayment(env, payment) {
  if (!payment?.id || !["PIX", "BOLETO"].includes(payment.billingType)) return payment;

  try {
    const qr = await asaasJson(env, `/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
    return {
      ...payment,
      pixQrCode: qr.payload || payment.pixQrCode,
      pixQrCodeUrl: qr.encodedImage || payment.pixQrCodeUrl
    };
  } catch (err) {
    return payment;
  }
}

async function createCarnetPayments(env, payload, customer) {
  const payments = [];
  const childName = payload.childName ? ` - ${payload.childName}` : "";
  const modality = payload.modalidade ? ` (${payload.modalidade})` : "";
  const paymentDay = Number(payload.paymentDay || 10);
  const today = new Date();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Se o dia de vencimento configurado já passou neste mês, a primeira cobrança
  // (matrícula + 1ª mensalidade) precisa cair no mês seguinte, senão a Asaas rejeita
  // com "Não é permitido data de vencimento inferior a hoje."
  let anchorYear = today.getFullYear();
  let anchorMonth = today.getMonth();
  const firstAttempt = new Date(anchorYear, anchorMonth, Math.min(paymentDay, 28));
  if (firstAttempt < todayDateOnly) {
    anchorMonth += 1;
  }

  if (payload.matriculaValue && Number(payload.matriculaValue) > 0) {
    const dueDate = new Date(anchorYear, anchorMonth, Math.min(paymentDay, 28));
    const payment = await asaasJson(env, "/payments", {
      method: "POST",
      body: JSON.stringify({
        customer,
        billingType: payload.billingType || "PIX",
        value: normalizeCurrencyValue(payload.matriculaValue),
        dueDate: dueDate.toISOString().split("T")[0],
        description: `Matrícula${childName}${modality}`,
        externalReference: `${payload.registrationId || "UBA"}_MATRICULA_${Date.now()}`
      })
    });
    payments.push(await enrichPixPayment(env, payment));
  }

  const mensalidadeValue = Number(payload.mensalidadeValue || 0);
  if (mensalidadeValue > 0) {
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const dueDate = new Date(anchorYear, anchorMonth + monthOffset, Math.min(paymentDay, 28));
      const monthLabel = dueDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
      const payment = await asaasJson(env, "/payments", {
        method: "POST",
        body: JSON.stringify({
          customer,
          billingType: payload.billingType || "PIX",
          value: normalizeCurrencyValue(mensalidadeValue),
          dueDate: dueDate.toISOString().split("T")[0],
          description: `Mensalidade ${monthLabel}${childName}${modality}`,
          externalReference: `${payload.registrationId || "UBA"}_${monthOffset + 1}_${Date.now()}`
        })
      });
      payments.push(await enrichPixPayment(env, payment));
    }
  }

  return payments;
}

/**
 * Processa mensagens na fila KV
 */
async function processQueue(env) {
  const isPaused = await env.UBA_STORAGE.get("mq:paused") === "true";
  if (isPaused) {
    console.log("[Queue] Processamento pausado manualmente.");
    return;
  }

  const list = await env.UBA_STORAGE.list({ prefix: "mq:pending:", limit: 20 });
  if (list.keys.length === 0) return;

  for (const key of list.keys) {
    const msgData = await env.UBA_STORAGE.get(key.name);
    if (!msgData) continue;

    const msg = JSON.parse(msgData);
    
    try {
      const result = await processMessage(msg, env);
      await logToFirestore(msg, result, env);
      await env.UBA_STORAGE.delete(key.name);
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      console.error(`Erro ao processar ${key.name}:`, err);
    }
  }
}

/**
 * Automação Diária de Aniversários
 */
async function processBirthdays(env, force = false) {
  try {
    // 1. Carrega Configurações do Firestore via REST
    const configRes = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/system_settings/whatsapp?key=${env.FIREBASE_API_KEY}`);
    if (!configRes.ok) return;
    const configDoc = await configRes.json();
    const fields = configDoc.fields || {};
    
    const enabled = fields.birthdayAutomationEnabled?.booleanValue || false;
    const sendTime = fields.birthdaySendTime?.stringValue || "09:00";
    const defaultImage = fields.birthdayDefaultImage?.stringValue || "";
    const testMode = fields.birthdayAutomationTestMode?.booleanValue || false;
    const testPhone = fields.testPhone?.stringValue || "5533998200546";
    
    if (!enabled) return;

    // 2. Checa Horário (America/Sao_Paulo)
    const now = new Date();
    const spTime = new Date(now.getTime() - 3 * 3600 * 1000); // UTC-3
    const todayStr = spTime.toISOString().split('T')[0]; // "2026-03-21"
    const currentTimeStr = spTime.toISOString().split('T')[1].substring(0, 5); // "09:01"

    // 3. Evita re-execução no mesmo dia (A menos que seja force)
    const lastRun = await env.UBA_STORAGE.get("last_birthday_run");
    if (lastRun === todayStr && !force) return 0;

    // 4. Se chegou o horário (A menos que seja force)
    if (currentTimeStr >= sendTime || force) {
      console.log(`Iniciando automação de aniversários para ${todayStr}... (Modo Teste: ${testMode}, Force: ${force})`);
      if (!force) await env.UBA_STORAGE.put("last_birthday_run", todayStr); // Marca como rodado apenas no fluxo auto

      // 5. Busca todos os alunos.
      // A API REST do Firestore ignora pageSize e limita a resposta (ex: 300 docs por página)
      // mesmo pedindo mais - é obrigatório paginar com nextPageToken, senão alunos fora da
      // primeira página ficam invisíveis (nunca recebem o aviso de aniversário).
      const regDocs = [];
      let bdayPageToken = undefined;
      do {
        const pageUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/uba_2026_registrations?key=${env.FIREBASE_API_KEY}&pageSize=300`
          + (bdayPageToken ? `&pageToken=${bdayPageToken}` : '');
        const registrationsRes = await fetch(pageUrl);
        if (!registrationsRes.ok) break;
        const registrations = await registrationsRes.json();
        if (registrations.documents) regDocs.push(...registrations.documents);
        bdayPageToken = registrations.nextPageToken;
      } while (bdayPageToken);

      const bdayStudents = [];
      const [todayDay, todayMonth] = [spTime.getDate(), spTime.getMonth() + 1];

      regDocs.forEach(doc => {
        const docFields = doc.fields || {};
        const alunos = docFields.alunos?.arrayValue?.values || [];
        const phone = docFields.responsavel?.mapValue?.fields?.telefonePrincipal?.stringValue || "";
        const id = doc.name.split('/').pop();
        
        alunos.forEach((alunoVal, idx) => {
          const aluno = alunoVal.mapValue?.fields || {};
          const bdayStr = aluno.dataNascimento?.stringValue; // "DD/MM/YYYY"
          if (bdayStr && phone) {
            const [d, m] = bdayStr.split('/');
            if (parseInt(d) === todayDay && parseInt(m) === todayMonth) {
              bdayStudents.push({
                id: `${id}-${idx}`,
                name: aluno.nome?.stringValue || "Aluno",
                phone: phone,
                photoUrl: aluno.fotoUrl?.stringValue || ""
              });
            }
          }
        });
      });

      console.log(`Encontrados ${bdayStudents.length} aniversariantes hoje.`);

      // 6. Dispara Mensagens
      const workerUrl = "https://uba-whatsapp-proxy.thayrufino2.workers.dev";
      
      for (const student of bdayStudents) {
        const firstName = student.name.split(' ')[0];
        const baseText = `Parabéns ${firstName}! 🥳🎂\n\nO Uba Clube Manhuaçu enviou esta mensagem automática para desejar um dia brilhante. Feliz Aniversário! 🎈`;
        
        const destino = testMode ? testPhone : student.phone;
        const textoFinal = testMode 
          ? `🧪 *[MODO TESTE AUTOMÁTICO]*\n_Destinatário original: ${student.phone}_\n\n${baseText}`
          : baseText;

        // Tenta localizar o cartão pré-renderizado (enviado pelo frontend)
        const customCardId = `bday_card_${student.id.replace(/-/g, '_')}`;
        const hasCustom = await env.UBA_STORAGE.get(`img:${customCardId}`);
        
        // Determina a imagem final (Precedence: Custom Card -> Student Photo -> Default Image)
        let finalImageUrl = defaultImage;
        if (hasCustom) {
          finalImageUrl = `${workerUrl}/view/${customCardId}`;
        } else if (student.photoUrl) {
          finalImageUrl = student.photoUrl;
        }

        const msg = {
          phone: destino,
          text: textoFinal,
          imageUrl: finalImageUrl,
          alunoNome: student.name,
          alunoFotoUrl: student.photoUrl
        };

        try {
          await queueMessage(msg, env);
        } catch (e) {
          console.error(`Erro ao enfileirar bday para ${student.name}:`, e);
        }
      }
    }
  } catch (err) {
    console.error("Erro na automação de aniversários:", err);
  }
}

/**
 * Enfileira uma mensagem no KV
 */
async function queueMessage(msg, env) {
  const timestamp = Date.now();
  const random = crypto.randomUUID().substring(0, 8);
  const key = `mq:pending:${timestamp}:${random}`;
  await env.UBA_STORAGE.put(key, JSON.stringify({
    ...msg,
    enqueuedAt: new Date().toISOString()
  }));
}

/**
 * Envia a mensagem usando a Evolution API
 */
async function processMessage(msg, env) {
  const isMedia = !!msg.imageUrl;
  const hasButtons = Array.isArray(msg.buttons) && msg.buttons.length > 0;
  
  // Se tiver botões (URL de pagamento), vamos incorporar no texto de forma bonita
  // pois os botões nativos estão falhando na renderização do WhatsApp MD
  let finalMessage = msg.text;
  if (hasButtons) {
    const payBtn = msg.buttons.find(b => b.type === 'url');
    if (payBtn) {
      finalMessage += `\n\n*Clique no link abaixo para pagar:*\n🔗 ${payBtn.url}\n\n━━━━━━━━━━━━━━\n_Se precisar de ajuda, estamos aqui!_`;
    }
  }

  const endpoint = isMedia ? `/message/sendMedia/${INSTANCE_NAME}` : `/message/sendText/${INSTANCE_NAME}`;
  const url = `${EVOLUTION_URL}${endpoint}`;

  let payload = {
    number: msg.phone,
    delay: 1500,
    options: { delay: 1500, presence: "composing", linkPreview: true }
  };

  if (isMedia) {
    let mediaContent = msg.imageUrl;
    let mimeType = 'image/png';

    // Se for uma URL (começa com http), tentamos converter para Base64 para garantir que a Evolution API receba
    if (msg.imageUrl.startsWith('http')) {
      try {
        const b64res = await getBase64FromUrl(msg.imageUrl);
        mediaContent = b64res.base64;
        mimeType = b64res.mimeType;
      } catch (err) {
        console.error("[Worker] Erro ao converter imagem para base64:", err);
        // Mantemos a URL original se falhar
      }
    }

    payload.mediatype = 'image';
    payload.mediaType = 'image';
    payload.mimetype = mimeType;
    payload.caption = finalMessage;
    payload.media = mediaContent;
  } else {
    payload.text = finalMessage;
    payload.linkPreview = true;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.EVOLUTION_API_KEY
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let jsonResponse = {};
  try {
    jsonResponse = JSON.parse(text);
  } catch (e) {
    jsonResponse = { raw: text };
  }

  console.log(`[Evolution] Result: ${res.ok ? 'SUCESSO' : 'ERRO'} | Body: ${text.substring(0, 100)}`);

  return {
    success: res.ok,
    status: res.ok ? 'SUCESSO' : 'ERRO',
    response: jsonResponse
  };
}

/**
 * Função auxiliar para converter URL em Base64 dentro do Worker
 */
async function getBase64FromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar imagem: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/png";
  
  // Usamos um loop para evitar erro de "Maximum call stack size exceeded" 
  // que ocorre com o spread operator (...) em arquivos grandes.
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return { base64, mimeType: contentType };
}

/**
 * Salva log no Firestore via REST API
 */
async function logToFirestore(msg, result, env) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const apiKey = env.FIREBASE_API_KEY;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/whatsapp_logs?key=${apiKey}`;

  const fields = {
    destinatario: { stringValue: msg.phone },
    mensagem: { stringValue: msg.text },
    status: { stringValue: result.status },
    dataHora: { stringValue: new Date().toISOString() },
    tipo: { stringValue: msg.imageUrl ? 'MEDIA' : 'TEXTO' }
  };

  if (msg.name) fields.alunoNome = { stringValue: msg.name };
  if (msg.photoUrl) fields.alunoFotoUrl = { stringValue: msg.photoUrl };
  
  const responseStr = typeof result.response === 'string' ? result.response : JSON.stringify(result.response);
  if (!result.success) fields.erro = { stringValue: responseStr.substring(0, 1000) };

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
}
