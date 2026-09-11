import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const HUB_PROXY_URL =
    (import.meta.env.VITE_WORKER_URL as string) || 'https://uba-whatsapp-proxy.thayrufino2.workers.dev';

const APP_URL = 'https://cadastrouba.com.br';

const DAILY_EVENTS_COLLECTION = 'uba_2026_daily_events';

export type AdminNotificationType = 'registration' | 'payment';
export type PaymentReminderRule = 'BEFORE' | 'ONDAY' | 'AFTER';

export interface AdminNotificationsConfig {
    adminPhone: string;
    notifyOnRegistration: boolean;
    notifyOnPayment: boolean;
    dailySummaryEnabled: boolean;
    dailySummaryTime: string;
    // Toggle de segurança global: enquanto true, TODO envio que iria para um responsável
    // (lembretes de pagamento + confirmação de pagamento identificado) é redirecionado para
    // o número do admin. Começa ligado por padrão (seguro), só desliga manualmente.
    redirectParentMessagesToAdmin: boolean;
    paymentReminderBeforeEnabled: boolean;
    paymentReminderBeforeDays: number;
    paymentReminderOnDayEnabled: boolean;
    paymentReminderAfterEnabled: boolean;
    paymentReminderAfterDays: number;
    paymentReminderSendTime: string;
    paymentReminderSendEndTime: string;
    paymentReminderIntervalSeconds: number;
}

const EMPTY_CONFIG: AdminNotificationsConfig = {
    adminPhone: '',
    notifyOnRegistration: false,
    notifyOnPayment: false,
    dailySummaryEnabled: false,
    dailySummaryTime: '09:00',
    redirectParentMessagesToAdmin: true,
    paymentReminderBeforeEnabled: false,
    paymentReminderBeforeDays: 3,
    paymentReminderOnDayEnabled: false,
    paymentReminderAfterEnabled: false,
    paymentReminderAfterDays: 5,
    paymentReminderSendTime: '09:00',
    paymentReminderSendEndTime: '18:00',
    paymentReminderIntervalSeconds: 5,
};

export async function loadAdminNotificationsConfig(): Promise<AdminNotificationsConfig> {
    try {
        const snap = await getDoc(doc(db, 'system_settings', 'admin_notifications'));
        if (!snap.exists()) return EMPTY_CONFIG;
        const d = snap.data();
        return {
            adminPhone: d.adminPhone || '',
            notifyOnRegistration: d.notifyOnRegistration === true,
            notifyOnPayment: d.notifyOnPayment === true,
            dailySummaryEnabled: d.dailySummaryEnabled === true,
            dailySummaryTime: d.dailySummaryTime || '09:00',
            redirectParentMessagesToAdmin: d.redirectParentMessagesToAdmin !== false,
            paymentReminderBeforeEnabled: d.paymentReminderBeforeEnabled === true,
            paymentReminderBeforeDays: d.paymentReminderBeforeDays ?? 3,
            paymentReminderOnDayEnabled: d.paymentReminderOnDayEnabled === true,
            paymentReminderAfterEnabled: d.paymentReminderAfterEnabled === true,
            paymentReminderAfterDays: d.paymentReminderAfterDays ?? 5,
            paymentReminderSendTime: d.paymentReminderSendTime || '09:00',
            paymentReminderSendEndTime: d.paymentReminderSendEndTime || '18:00',
            paymentReminderIntervalSeconds: d.paymentReminderIntervalSeconds ?? 5,
        };
    } catch (e) {
        console.error('Erro ao carregar config de avisos ao admin:', e);
        return EMPTY_CONFIG;
    }
}

export async function saveAdminNotificationsConfig(config: AdminNotificationsConfig): Promise<boolean> {
    try {
        await setDoc(doc(db, 'system_settings', 'admin_notifications'), config, { merge: true });
        return true;
    } catch (e) {
        console.error('Erro ao salvar config de avisos ao admin:', e);
        return false;
    }
}

function normalizeAdminPhone(phone: string) {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') ? digits : `55${digits}`;
}

/** Quebra um Date em partes no fuso de São Paulo, independente do fuso do navegador. */
function saoPauloParts(date: Date) {
    const fmt = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = fmt.formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '';
    return {
        dateStr: `${get('year')}-${get('month')}-${get('day')}`, // p/ consultas (YYYY-MM-DD)
        dateDisplay: `${get('day')}/${get('month')}/${get('year')}`, // p/ exibir (dd/mm/aaaa)
        horario: `${get('hour')}:${get('minute')}`, // HH:mm
    };
}

/** Registra um evento do dia (inscrição ou pagamento). Usado pelo Resumo Diário (worker)
 * pra contar cadastros/pagamentos do dia - não aparece mais nos cartões individuais. */
async function logDailyEvent(type: AdminNotificationType, nome: string, valor?: number) {
    const { dateStr, horario } = saoPauloParts(new Date());
    try {
        await addDoc(collection(db, DAILY_EVENTS_COLLECTION), {
            type,
            nome: (nome || '').trim(),
            horario,
            dateStr,
            valor: typeof valor === 'number' ? valor : null,
            createdAt: new Date().toISOString(),
        });
    } catch (e) {
        console.error('Erro ao registrar evento diário:', e);
    }
}

const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Calcula a idade em anos a partir de uma data DD/MM/YYYY, na data de hoje (fuso de SP). */
function calculateAge(dataNascimentoBR?: string): number | null {
    if (!dataNascimentoBR) return null;
    const parts = dataNascimentoBR.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(Number);
    if (!d || !m || !y) return null;

    const { dateStr } = saoPauloParts(new Date());
    const [ty, tm, td] = dateStr.split('-').map(Number);

    let age = ty - y;
    if (tm < m || (tm === m && td < d)) age--;
    return age >= 0 ? age : null;
}

/** Formata uma data YYYY-MM-DD (ou já em DD/MM/YYYY) pra exibição dd/mm/aaaa. */
function formatDateBR(dateStr?: string): string {
    if (!dateStr) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('pt-BR');
}

function billingTypeLabel(billingType?: string): string {
    switch ((billingType || '').toUpperCase()) {
        case 'PIX': return 'PIX';
        case 'BOLETO': return 'Boleto';
        case 'CREDIT_CARD': return 'Cartão';
        default: return billingType || 'Não informado';
    }
}

/** Quantos dias de diferença entre o vencimento e a data em que foi pago (positivo = atraso). */
function daysLate(dueDate?: string, paymentDate?: string): number | null {
    if (!dueDate || !paymentDate) return null;
    const due = new Date(dueDate.substring(0, 10) + 'T00:00:00');
    const paid = new Date(paymentDate.substring(0, 10) + 'T00:00:00');
    if (isNaN(due.getTime()) || isNaN(paid.getTime())) return null;
    return Math.round((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

function buildApprovalLink(registrationId: string): string {
    return `${APP_URL}/admin/details/${registrationId}`;
}

// ─── Carregamento de imagens (canvas) ──────────────────────────────────────

function loadImageEl(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/** Fotos de aluno ficam em outra origem (worker/proxy) - precisa de crossOrigin pra não
 * "sujar" o canvas e travar o toDataURL() depois (mesmo padrão já usado nos aniversários). */
function loadStudentPhoto(src?: string): Promise<HTMLImageElement | null> {
    if (!src) return Promise.resolve(null);
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const words = (text || '').split(' ').filter(Boolean);
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        const attempt = current ? `${current} ${word}` : word;
        if (ctx.measureText(attempt).width <= maxWidth || !current) {
            current = attempt;
        } else {
            lines.push(current);
            current = word;
            if (lines.length === maxLines - 1) break;
        }
    }
    if (current) lines.push(current);

    if (lines.length > maxLines) lines.length = maxLines;

    // Se sobrou texto além do que coube, adiciona reticências na última linha.
    const consumed = lines.join(' ').length;
    if (consumed < text.length && lines.length === maxLines) {
        let last = lines[maxLines - 1];
        while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
            last = last.slice(0, -1);
        }
        lines[maxLines - 1] = `${last}…`;
    }

    return lines;
}

// ─── Dados dos avisos ──────────────────────────────────────────────────────

export interface RegistrationNotificationData {
    registrationId: string;
    nome: string;
    modalidade?: string;
    dataNascimento?: string; // DD/MM/YYYY
    fotoUrl?: string;
    responsavelNome?: string;
    telefone?: string;
    email?: string;
    turmaHorario?: string;
}

export interface RemainingDebt {
    description: string;
    dueDate: string; // YYYY-MM-DD
    isOverdue: boolean;
}

export interface PaymentNotificationData {
    studentId: string;
    nome: string;
    modalidade?: string;
    fotoUrl?: string;
    payerNome?: string;
    valor?: number;
    description?: string;
    dueDate?: string;
    paymentDate?: string;
    billingType?: string;
    remainingDebts?: RemainingDebt[];
}

// ─── Layout / desenho dos cartões (canvas) ─────────────────────────────────
// Header + foto do atleta + dados, tudo numa imagem vertical só - sem legenda
// separada. Cantos retos e paleta vermelho/azul/verde, igual ao resto do app
// (a global override "border-radius:0" do App.css não existe aqui, então
// desenhamos os retângulos já retos por padrão).

const CANVAS_WIDTH = 640;
const JPEG_QUALITY = 0.72;

const COLOR_INK = '#1f2438';
const COLOR_MUTED = '#8a8f9c';
const COLOR_BORDER = '#e5e5e5';
const COLOR_LIGHT = '#f5f7fa';
const COLOR_WHITE = '#ffffff';
const COLOR_BLUE = '#1d4ed8';
const COLOR_BLUE_BG = '#eff6ff';
const COLOR_GREEN = '#15803d';
const COLOR_GREEN_BG = '#f0fdf4';
const COLOR_LATE = '#b3541e';
const COLOR_LATE_BG = '#fdf1e8';

const PAD_X = 24;
const AVATAR_SIZE = 165;
const AVATAR_OVERLAP = 120; // quanto da foto "sobe" sobre o header
// Linhas/gaps compactos (só o respiro necessário) - o texto continua grande, só sem
// desperdiçar altura, senão a imagem fica alta demais e o WhatsApp corta o topo na
// miniatura do chat (mostra só a parte de baixo até abrir em tela cheia).
const ROW_H = 48;
const GAP_SM = 6;
const GAP_MD = 12;

// Fontes bem grandes - a imagem some pra ~300px de largura na miniatura do WhatsApp,
// então tudo precisa dar pra ler de cara, sem precisar abrir a foto em tela cheia.
const NAME_FONT = 32;
const NAME_LINE_H = 34;
const SUBLINE_FONT = 19;
const SUBLINE_H = 22;
const STATUS_FONT = 20;
const STATUS_H = 38;
const BADGE_FONT = 21;
const BADGE_H = 40;
const FIELD_LABEL_FONT = 18;
const FIELD_VALUE_FONT = 22;
const DEBT_ROW_H = 36;
const DEBT_ROW_FONT = 19;
const DEBT_MORE_H = 28;
const DEBT_MORE_FONT = 16;
const NODEBT_H = 38;
const NODEBT_FONT = 19;
const CTA_H = 62;
const CTA_FONT = 22;
const CTA_LINE_H = 24;

interface FieldRow {
    label: string;
    value: string;
    color?: string;
}

function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, border?: string, borderWidth = 1) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
    if (border) {
        ctx.strokeStyle = border;
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(x + borderWidth / 2, y + borderWidth / 2, w - borderWidth, h - borderWidth);
    }
}

function drawFieldRow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, row: FieldRow) {
    drawRect(ctx, x, y, w, ROW_H - 1, COLOR_LIGHT, COLOR_BORDER, 1);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `bold ${FIELD_LABEL_FONT}px Arial, sans-serif`;
    ctx.fillStyle = COLOR_MUTED;
    ctx.fillText(row.label.toUpperCase(), x + 14, y + ROW_H / 2);

    ctx.textAlign = 'right';
    ctx.font = `bold ${FIELD_VALUE_FONT}px Arial, sans-serif`;
    ctx.fillStyle = row.color || COLOR_INK;
    let value = row.value;
    const maxValueWidth = w - 28 - ctx.measureText(row.label.toUpperCase()).width - 10;
    while (ctx.measureText(value).width > maxValueWidth && value.length > 4) {
        value = value.slice(0, -1);
    }
    if (value !== row.value) value = value.replace(/\s*$/, '') + '…';
    ctx.fillText(value, x + w - 14, y + ROW_H / 2);
}

async function renderCompositeCard(opts: {
    headerImage: string;
    accentColor: string;
    accentBg: string;
    fotoUrl?: string;
    badgeText?: string;
    badgeColor?: string;
    name: string;
    subLine: string;
    statusText?: string;
    statusColor: string;
    statusBg: string;
    fieldRows: FieldRow[];
    debtItems?: { label: string; value: string }[];
    debtMoreCount?: number;
    noDebtText?: string;
    ctaText?: string;
}): Promise<string> {
    const [headerImg, photoImg] = await Promise.all([
        loadImageEl(opts.headerImage),
        loadStudentPhoto(opts.fotoUrl),
    ]);

    const w = CANVAS_WIDTH;
    const headerH = Math.round(headerImg.height * (w / headerImg.width));

    // --- 1ª passada: mede quanto de altura o painel branco vai precisar ---
    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d')!;

    let panelH = (AVATAR_SIZE - AVATAR_OVERLAP) + GAP_MD;
    if (opts.badgeText) panelH += BADGE_H + GAP_SM;

    mctx.font = `bold ${NAME_FONT}px Arial, sans-serif`;
    const nameLines = wrapText(mctx, opts.name.toUpperCase(), w - PAD_X * 2, 2);
    panelH += nameLines.length * NAME_LINE_H + GAP_SM;

    if (opts.subLine) panelH += SUBLINE_H + GAP_SM;
    if (opts.statusText) panelH += STATUS_H + GAP_MD;

    panelH += opts.fieldRows.length * ROW_H + GAP_MD;

    if (opts.debtItems || opts.noDebtText) {
        if (opts.noDebtText) {
            panelH += NODEBT_H + GAP_MD;
        } else if (opts.debtItems) {
            panelH += opts.debtItems.length * DEBT_ROW_H;
            if (opts.debtMoreCount && opts.debtMoreCount > 0) panelH += DEBT_MORE_H;
            panelH += GAP_MD;
        }
    }

    if (opts.ctaText) panelH += CTA_H + GAP_MD;

    panelH += 18; // padding inferior

    const totalH = headerH + panelH;

    // --- 2ª passada: desenha de verdade ---
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context não disponível');

    // Header (arte pronta do mascote)
    ctx.drawImage(headerImg, 0, 0, w, headerH);

    // Painel branco com borda por tipo de aviso
    const panelTop = headerH; // o painel em si começa onde a arte termina
    const borderW = 4;
    drawRect(ctx, 0, panelTop, w, totalH - panelTop, COLOR_WHITE, opts.accentColor, borderW);

    let cursorY = panelTop + (AVATAR_SIZE - AVATAR_OVERLAP) + GAP_MD;

    // Foto do atleta - quadrada, sem arredondamento, moldura colorida por tipo
    const avatarX = (w - AVATAR_SIZE) / 2;
    const avatarY = headerH - AVATAR_OVERLAP;
    drawRect(ctx, avatarX - 4, avatarY - 4, AVATAR_SIZE + 8, AVATAR_SIZE + 8, opts.accentColor);
    if (photoImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
        ctx.clip();
        const scale = Math.max(AVATAR_SIZE / photoImg.width, AVATAR_SIZE / photoImg.height);
        const dw = photoImg.width * scale;
        const dh = photoImg.height * scale;
        ctx.drawImage(photoImg, avatarX - (dw - AVATAR_SIZE) / 2, avatarY - (dh - AVATAR_SIZE) / 2, dw, dh);
        ctx.restore();
    } else {
        drawRect(ctx, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE, COLOR_LIGHT);
    }

    ctx.textAlign = 'center';

    // Selo (só cadastro novo)
    if (opts.badgeText) {
        const badgeW = w - PAD_X * 2;
        drawRect(ctx, PAD_X, cursorY, badgeW, BADGE_H, opts.badgeColor || opts.accentBg, opts.accentColor, 2);
        ctx.fillStyle = opts.accentColor;
        ctx.font = `bold ${BADGE_FONT}px Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(opts.badgeText.toUpperCase(), w / 2, cursorY + BADGE_H / 2);
        cursorY += BADGE_H + GAP_SM;
    }

    // Nome
    ctx.fillStyle = COLOR_INK;
    ctx.font = `bold ${NAME_FONT}px Arial, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    nameLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, cursorY + NAME_FONT - 2 + i * NAME_LINE_H);
    });
    cursorY += nameLines.length * NAME_LINE_H + GAP_SM;

    // Sub-linha (modalidade / referência)
    if (opts.subLine) {
        ctx.fillStyle = opts.accentColor;
        ctx.font = `bold ${SUBLINE_FONT}px Arial, sans-serif`;
        ctx.fillText(opts.subLine.toUpperCase(), w / 2, cursorY + SUBLINE_FONT);
        cursorY += SUBLINE_H + GAP_SM;
    }

    // Selo de status (pendente de aprovação / pago em dia / atraso)
    if (opts.statusText) {
        ctx.font = `bold ${STATUS_FONT}px Arial, sans-serif`;
        const badgeW = Math.min(w - PAD_X * 2, ctx.measureText(opts.statusText.toUpperCase()).width + 48);
        const bx = (w - badgeW) / 2;
        drawRect(ctx, bx, cursorY, badgeW, STATUS_H, opts.statusBg, opts.statusColor, 2);
        ctx.fillStyle = opts.statusColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(opts.statusText.toUpperCase(), w / 2, cursorY + STATUS_H / 2);
        ctx.textBaseline = 'alphabetic';
        cursorY += STATUS_H + GAP_MD;
    }

    // Linhas de dados
    const rowsX = PAD_X;
    const rowsW = w - PAD_X * 2;
    opts.fieldRows.forEach((row, i) => {
        drawFieldRow(ctx, rowsX, cursorY + i * ROW_H, rowsW, row);
    });
    cursorY += opts.fieldRows.length * ROW_H + GAP_MD;

    // Pendências restantes (só pagamento)
    if (opts.noDebtText) {
        drawRect(ctx, rowsX, cursorY, rowsW, NODEBT_H, COLOR_GREEN_BG, COLOR_GREEN, 2);
        ctx.fillStyle = COLOR_GREEN;
        ctx.font = `bold ${NODEBT_FONT}px Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(opts.noDebtText.toUpperCase(), w / 2, cursorY + NODEBT_H / 2);
        ctx.textBaseline = 'alphabetic';
        cursorY += NODEBT_H + GAP_MD;
    } else if (opts.debtItems && opts.debtItems.length > 0) {
        opts.debtItems.forEach((item, i) => {
            const y = cursorY + i * DEBT_ROW_H;
            drawRect(ctx, rowsX, y, rowsW, DEBT_ROW_H - 1, COLOR_LIGHT, COLOR_BORDER, 1);
            ctx.textAlign = 'left';
            ctx.font = `bold ${DEBT_ROW_FONT}px Arial, sans-serif`;
            ctx.fillStyle = COLOR_INK;
            ctx.textBaseline = 'middle';
            ctx.fillText(item.label, rowsX + 12, y + DEBT_ROW_H / 2);
            ctx.textAlign = 'right';
            ctx.fillStyle = COLOR_LATE;
            ctx.fillText(item.value, rowsX + rowsW - 12, y + DEBT_ROW_H / 2);
        });
        cursorY += opts.debtItems.length * DEBT_ROW_H;
        if (opts.debtMoreCount && opts.debtMoreCount > 0) {
            drawRect(ctx, rowsX, cursorY, rowsW, DEBT_MORE_H, COLOR_LIGHT, COLOR_BORDER, 1);
            ctx.textAlign = 'center';
            ctx.font = `bold ${DEBT_MORE_FONT}px Arial, sans-serif`;
            ctx.fillStyle = COLOR_MUTED;
            ctx.textBaseline = 'middle';
            ctx.fillText(`+ ${opts.debtMoreCount} outras mensalidades em aberto`, w / 2, cursorY + DEBT_MORE_H / 2);
            ctx.textBaseline = 'alphabetic';
            cursorY += DEBT_MORE_H;
        }
        cursorY += GAP_MD;
    }

    // Chamada pra ação (só cadastro novo - o link real vai no texto da mensagem)
    if (opts.ctaText) {
        drawRect(ctx, rowsX, cursorY, rowsW, CTA_H, opts.accentBg, opts.accentColor, 2);
        ctx.textAlign = 'center';
        ctx.font = `bold ${CTA_FONT}px Arial, sans-serif`;
        ctx.fillStyle = opts.accentColor;
        const ctaLines = wrapText(ctx, opts.ctaText.toUpperCase(), rowsW - 24, 2);
        const startY = cursorY + CTA_H / 2 - ((ctaLines.length - 1) * (CTA_LINE_H / 2));
        ctaLines.forEach((line, i) => {
            ctx.fillText(line, w / 2, startY + i * CTA_LINE_H);
        });
    }

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function renderRegistrationCard(data: RegistrationNotificationData): Promise<string> {
    const age = calculateAge(data.dataNascimento);
    const nascimentoValue = data.dataNascimento
        ? `${data.dataNascimento}${age !== null ? ` (${age} anos)` : ''}`
        : 'Não informado';

    const fieldRows: FieldRow[] = [
        { label: 'Nascimento', value: nascimentoValue },
        { label: 'Turma/Horário', value: data.turmaHorario || 'A definir' },
        { label: 'Responsável', value: data.responsavelNome || 'Não informado' },
        { label: 'Telefone', value: data.telefone || 'Não informado' },
        { label: 'Email', value: data.email || 'Não informado' },
        { label: 'Plano', value: 'A definir' },
    ];

    return renderCompositeCard({
        headerImage: '/novo-atleta.png',
        accentColor: COLOR_BLUE,
        accentBg: COLOR_BLUE_BG,
        fotoUrl: data.fotoUrl,
        name: data.nome || 'Aluno',
        subLine: data.modalidade || '',
        statusText: 'Pendente de aprovação',
        statusColor: COLOR_LATE,
        statusBg: COLOR_LATE_BG,
        fieldRows,
        ctaText: 'Clique no link abaixo para aprovar o atleta',
    });
}

async function renderPaymentCard(data: PaymentNotificationData): Promise<string> {
    const late = daysLate(data.dueDate, data.paymentDate);
    const statusText = late === null
        ? undefined
        : late > 0
            ? `Pago com ${late} dia${late === 1 ? '' : 's'} de atraso`
            : 'Pago em dia';

    const fieldRows: FieldRow[] = [
        { label: 'Referência', value: data.description || 'Mensalidade' },
        { label: 'Forma de pagamento', value: billingTypeLabel(data.billingType) },
        { label: 'Vencimento', value: formatDateBR(data.dueDate) || 'Não informado' },
        { label: 'Pago em', value: formatDateBR(data.paymentDate) || 'Não informado' },
        { label: 'Valor pago', value: typeof data.valor === 'number' ? formatBRL(data.valor) : 'Não informado', color: COLOR_GREEN },
    ];

    const debts = data.remainingDebts || [];
    const debtItems = debts.slice(0, 3).map(d => ({
        label: d.description,
        value: `venc. ${formatDateBR(d.dueDate)}${d.isOverdue ? ' · atrasada' : ''}`,
    }));

    return renderCompositeCard({
        headerImage: '/pagamento-identificado.png',
        accentColor: COLOR_GREEN,
        accentBg: COLOR_GREEN_BG,
        fotoUrl: data.fotoUrl,
        name: data.payerNome || 'Responsável',
        subLine: `Ref. ${data.nome || 'Aluno'}${data.modalidade ? ` · ${data.modalidade}` : ''}`,
        statusText,
        statusColor: late && late > 0 ? COLOR_LATE : COLOR_GREEN,
        statusBg: late && late > 0 ? COLOR_LATE_BG : COLOR_GREEN_BG,
        fieldRows,
        debtItems: debts.length > 0 ? debtItems : undefined,
        debtMoreCount: Math.max(0, debts.length - 3),
        noDebtText: debts.length === 0 ? 'Sem pendências restantes' : undefined,
    });
}

// ─── Envio ──────────────────────────────────────────────────────────────

async function sendHubMessage(to: string, text: string, imageUrl: string) {
    try {
        const body: Record<string, unknown> = { to, text, imageUrl };

        const res = await fetch(`${HUB_PROXY_URL}/hub/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) console.error('Falha ao enviar aviso ao admin via hub:', json);
        return { success: res.ok, body: json };
    } catch (e: any) {
        console.error('Erro ao enviar aviso ao admin via hub:', e);
        return { success: false, body: { error: e.message } };
    }
}

async function sendRegistrationNotification(config: AdminNotificationsConfig, data: RegistrationNotificationData) {
    if (!config.adminPhone) return { success: false, body: { error: 'Telefone do admin não configurado.' } };
    const image = await renderRegistrationCard(data);
    const text = `*NOVO ATLETA!*\n\n${(data.nome || 'Aluno').toUpperCase()}\n\n🔗 Aprovar cadastro: ${buildApprovalLink(data.registrationId)}`;
    return sendHubMessage(normalizeAdminPhone(config.adminPhone), text, image);
}

async function sendPaymentNotification(config: AdminNotificationsConfig, data: PaymentNotificationData) {
    if (!config.adminPhone) return { success: false, body: { error: 'Telefone do admin não configurado.' } };
    const image = await renderPaymentCard(data);
    return sendHubMessage(normalizeAdminPhone(config.adminPhone), '✅ Pagamento identificado', image);
}

/**
 * Chamar quando uma nova inscrição é recebida (formulário público).
 * Registra o evento do dia (usado pelo Resumo Diário) e, se o aviso estiver ativo,
 * envia o cartão único (foto + ficha do atleta + link de aprovação) ao admin.
 */
export async function notifyAdminNewRegistration(data: RegistrationNotificationData) {
    await logDailyEvent('registration', data.nome);

    const config = await loadAdminNotificationsConfig();
    if (!config.notifyOnRegistration || !config.adminPhone) return;

    await sendRegistrationNotification(config, data);
}

/**
 * Chamar quando a sincronização financeira detecta que um pagamento foi processado.
 * Registra o evento do dia (usado pelo Resumo Diário) e, se o aviso estiver ativo,
 * envia o cartão único (foto + dados do pagamento + pendências restantes) ao admin.
 */
export async function notifyAdminPaymentProcessed(data: PaymentNotificationData) {
    await logDailyEvent('payment', data.nome, data.valor);

    const config = await loadAdminNotificationsConfig();
    if (!config.notifyOnPayment || !config.adminPhone) return;

    await sendPaymentNotification(config, data);
}

// ─── Dados reais aleatórios (teste/prévia na página de configuração) ──────

async function fetchRandomPendingRegistration(): Promise<RegistrationNotificationData | null> {
    try {
        const q = query(collection(db, 'uba_2026_registrations'), where('contractStatus', '==', 'pendente'));
        const snap = await getDocs(q);
        const candidates: RegistrationNotificationData[] = [];
        snap.docs.forEach(d => {
            const reg = d.data() as any;
            const aluno = reg.alunos?.[0];
            if (!aluno?.fotoUrl) return;
            const dias: string[] = Array.isArray(reg.dias) ? reg.dias : [];
            candidates.push({
                registrationId: d.id,
                nome: aluno.nome || 'Aluno',
                modalidade: reg.modalidade,
                dataNascimento: aluno.dataNascimento,
                fotoUrl: aluno.fotoUrl,
                responsavelNome: reg.responsavel?.nome,
                telefone: reg.responsavel?.telefonePrincipal,
                email: reg.responsavel?.email,
                turmaHorario: dias.length ? `${dias.join('/')} · ${reg.horario || ''}`.trim() : '',
            });
        });
        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    } catch (e) {
        console.error('Erro ao buscar inscrição pendente real para teste:', e);
        return null;
    }
}

async function fetchRandomReceivedPayment(): Promise<PaymentNotificationData | null> {
    try {
        const [paySnap, regSnap] = await Promise.all([
            getDocs(collection(db, 'financial_payments')),
            getDocs(collection(db, 'uba_2026_registrations')),
        ]);

        const regMap: Record<string, any> = {};
        regSnap.docs.forEach(d => { regMap[d.id] = d.data(); });

        const candidates: PaymentNotificationData[] = [];
        paySnap.docs.forEach(d => {
            const p = d.data() as any;
            if (!['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(p.status)) return;
            const reg = regMap[p.studentId];
            const aluno = reg?.alunos?.[0];
            if (!reg || reg.contractStatus !== 'aprovado' || !aluno?.fotoUrl) return;

            candidates.push({
                studentId: p.studentId,
                nome: aluno.nome || 'Aluno',
                modalidade: reg.modalidade,
                fotoUrl: aluno.fotoUrl,
                payerNome: reg.responsavel?.nome || 'Responsável',
                valor: p.value,
                description: p.description || 'Mensalidade',
                dueDate: p.dueDate,
                paymentDate: p.paymentDate || p.clientPaymentDate || p.dueDate,
                billingType: p.billingType,
                remainingDebts: [],
            });
        });
        if (candidates.length === 0) return null;

        const pick = candidates[Math.floor(Math.random() * candidates.length)];

        // Busca as pendências reais desse aluno (mesma coleção já carregada acima).
        const remaining: RemainingDebt[] = [];
        paySnap.docs.forEach(d => {
            const p = d.data() as any;
            if (p.studentId !== pick.studentId) return;
            if (!['PENDING', 'OVERDUE'].includes(p.status)) return;
            const isManual = p.externalReference?.startsWith?.('MANUAL_');
            if (isManual) return;
            remaining.push({
                description: p.description || 'Mensalidade',
                dueDate: p.dueDate,
                isOverdue: p.status === 'OVERDUE',
            });
        });
        remaining.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
        pick.remainingDebts = remaining;

        return pick;
    } catch (e) {
        console.error('Erro ao buscar pagamento real para teste:', e);
        return null;
    }
}

/**
 * Dispara, isoladamente, um teste do aviso de novo atleta cadastrado, usando uma
 * inscrição real pendente de aprovação (aleatória). Usado na página de configuração.
 */
export async function sendRegistrationTest(config: AdminNotificationsConfig) {
    const data = await fetchRandomPendingRegistration();
    if (!data) return { success: false, body: { error: 'Nenhuma inscrição pendente de aprovação encontrada com foto.' } };
    return sendRegistrationNotification(config, data);
}

/**
 * Dispara, isoladamente, um teste do aviso de pagamento identificado, usando um
 * pagamento real já recebido (aleatório). Usado na página de configuração.
 */
export async function sendPaymentTest(config: AdminNotificationsConfig) {
    const data = await fetchRandomReceivedPayment();
    if (!data) return { success: false, body: { error: 'Nenhum pagamento real recebido encontrado com foto de aluno aprovado.' } };
    return sendPaymentNotification(config, data);
}

/**
 * Monta a prévia (texto + imagem) de um dos avisos usando um registro real aleatório
 * (inscrição pendente ou pagamento recebido, conforme o tipo), sem enviar nada.
 */
export async function previewAdminNotification(type: AdminNotificationType): Promise<{ text: string; image: string | null; error?: string }> {
    try {
        if (type === 'registration') {
            const data = await fetchRandomPendingRegistration();
            if (!data) return { text: '', image: null, error: 'Nenhuma inscrição pendente de aprovação encontrada com foto.' };
            const [image] = await Promise.all([renderRegistrationCard(data)]);
            return { text: `*NOVO ATLETA!*\n\n${(data.nome || 'Aluno').toUpperCase()}\n\n🔗 Aprovar cadastro: ${buildApprovalLink(data.registrationId)}`, image };
        }
        const data = await fetchRandomReceivedPayment();
        if (!data) return { text: '', image: null, error: 'Nenhum pagamento real recebido encontrado com foto de aluno aprovado.' };
        const image = await renderPaymentCard(data);
        return { text: '✅ Pagamento identificado', image };
    } catch (e: any) {
        console.error('Erro ao gerar prévia do aviso:', e);
        return { text: '', image: null, error: e.message };
    }
}

/**
 * Data (YYYY-MM-DD) de "ontem" no fuso de São Paulo — é o padrão usado como data de teste
 * do resumo diário, já que em produção ele sempre resume o dia anterior inteiro.
 */
export function getYesterdaySP(): string {
    const { dateStr } = saoPauloParts(new Date(Date.now() - 24 * 3600 * 1000));
    return dateStr;
}

/**
 * Converte YYYY-MM-DD pra dd/mm/aaaa, só pra exibição.
 */
export function formatDateStrBR(dateStr: string): string {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

/**
 * Busca a prévia (texto + imagem) do resumo diário pra uma data específica, sem enviar nada.
 * Roda no servidor (mesma lógica usada pelo cron), pra prévia bater exatamente com o que
 * seria enviado de verdade.
 */
export async function previewDailySummary(dateStr: string): Promise<{ text: string; imageUrl: string } | null> {
    try {
        const res = await fetch(`${HUB_PROXY_URL}/daily-summary-preview?date=${encodeURIComponent(dateStr)}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
            console.error('Erro ao buscar prévia do resumo diário:', data);
            return null;
        }
        return { text: data.text, imageUrl: data.imageUrl };
    } catch (e) {
        console.error('Erro ao buscar prévia do resumo diário:', e);
        return null;
    }
}

/**
 * Dispara, isoladamente, o resumo diário pra uma data específica (teste manual da página de
 * configuração). Usa o mesmo caminho de envio do cron automático.
 */
export async function sendDailySummaryTest(config: AdminNotificationsConfig, testDateStr: string) {
    if (!config.adminPhone) return { success: false, error: 'Telefone do admin não configurado.' };
    try {
        const res = await fetch(`${HUB_PROXY_URL}/daily-summary-trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ testDate: testDateStr, testPhone: normalizeAdminPhone(config.adminPhone) })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) console.error('Falha ao enviar teste do resumo diário:', data);
        return { success: res.ok && data.success !== false, body: data };
    } catch (e: any) {
        console.error('Erro ao enviar teste do resumo diário:', e);
        return { success: false, body: { error: e.message } };
    }
}

/**
 * Prévia (sem enviar) de um lembrete de pagamento, usando um aluno real aprovado aleatório
 * com fatura real batendo com a regra pedida (rodando inteiramente no servidor).
 */
export async function previewPaymentReminder(rule: PaymentReminderRule): Promise<{ text: string | null; studentName: string | null; message?: string }> {
    try {
        const res = await fetch(`${HUB_PROXY_URL}/payment-reminder-preview?rule=${rule}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
            console.error('Erro ao buscar prévia do lembrete de pagamento:', data);
            return { text: null, studentName: null, message: data.error };
        }
        return { text: data.text, studentName: data.studentName, message: data.message };
    } catch (e) {
        console.error('Erro ao buscar prévia do lembrete de pagamento:', e);
        return { text: null, studentName: null };
    }
}

/**
 * Dispara, isoladamente, um lembrete de pagamento real (aluno real aprovado aleatório).
 * O destino final SEMPRE respeita o toggle global de redirecionamento pro admin, no servidor.
 */
interface PaymentReminderTestResult {
    success: boolean;
    text?: string;
    studentName?: string;
    redirected?: boolean;
    error?: string;
    sendError?: string;
}

export async function sendPaymentReminderTest(rule: PaymentReminderRule): Promise<PaymentReminderTestResult> {
    try {
        const res = await fetch(`${HUB_PROXY_URL}/payment-reminder-test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rule })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) console.error('Falha ao enviar teste de lembrete de pagamento:', data);
        return data as PaymentReminderTestResult;
    } catch (e: any) {
        console.error('Erro ao enviar teste de lembrete de pagamento:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Notifica o responsável que um pagamento foi confirmado (além do aviso ao admin, que
 * continua indo pelo hub). Chamar assim que a sincronização financeira detectar o pagamento.
 * Respeita o toggle global de redirecionamento pro admin no servidor.
 */
export async function notifyParentPaymentConfirmed(data: { phone?: string; nome: string; valor?: number }) {
    if (!data.phone) return { success: false, error: 'Telefone do responsável não disponível.' };
    try {
        const res = await fetch(`${HUB_PROXY_URL}/notify-parent-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: data.phone, nome: data.nome, valor: data.valor })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) console.error('Falha ao notificar responsável sobre pagamento:', body);
        return { success: res.ok && body.success !== false, body };
    } catch (e: any) {
        console.error('Erro ao notificar responsável sobre pagamento:', e);
        return { success: false, error: e.message };
    }
}

export interface PaymentReminderCountResult {
    success: boolean;
    count: number;
    byRule: Partial<Record<PaymentReminderRule, number>>;
    error?: string;
}

/**
 * Conta quantos lembretes de pagamento seriam disparados HOJE com as regras/dias informados
 * (mesmo que ainda não tenham sido salvos) - roda inteiramente no servidor com dados reais.
 */
export async function fetchPaymentReminderCount(draft: {
    paymentReminderBeforeEnabled: boolean;
    paymentReminderBeforeDays: number;
    paymentReminderOnDayEnabled: boolean;
    paymentReminderAfterEnabled: boolean;
    paymentReminderAfterDays: number;
}): Promise<PaymentReminderCountResult> {
    try {
        const res = await fetch(`${HUB_PROXY_URL}/payment-reminder-count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) return { success: false, count: 0, byRule: {}, error: data.error };
        return { success: true, count: data.count, byRule: data.byRule || {} };
    } catch (e: any) {
        console.error('Erro ao calcular contagem de lembretes de pagamento:', e);
        return { success: false, count: 0, byRule: {}, error: e.message };
    }
}

export interface PaymentReminderHistoryItem {
    studentName: string;
    studentPhoto: string;
    rule: string;
    phone: string;
    redirected: boolean;
    success: boolean;
    isTest: boolean;
    sentAt: string;
}

/**
 * Busca os últimos lembretes de pagamento realmente disparados (nome + foto do aluno),
 * pra exibir na aba de Histórico.
 */
export async function fetchPaymentReminderHistory(): Promise<PaymentReminderHistoryItem[]> {
    try {
        const res = await fetch(`${HUB_PROXY_URL}/payment-reminder-history`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) return [];
        return data.items || [];
    } catch (e) {
        console.error('Erro ao buscar histórico de lembretes de pagamento:', e);
        return [];
    }
}

// ─── Notificação de Contrato Assinado ──────────────────────────────────────

export interface ContractSignedNotificationData {
    registrationId: string;
    nome: string;
    modalidade?: string;
    fotoUrl?: string;
    responsavelNome?: string;
    telefone?: string;
    signedAt?: string; // ISO 8601
}

const COLOR_PURPLE = '#7c3aed';
const COLOR_PURPLE_BG = '#f5f3ff';

async function renderContractSignedCard(data: ContractSignedNotificationData): Promise<string> {
    const now = data.signedAt ? new Date(data.signedAt) : new Date();
    const { dateDisplay, horario } = saoPauloParts(now);
    const signedDateStr = `${dateDisplay} às ${horario}`;

    const fieldRows: FieldRow[] = [
        { label: 'Modalidade', value: data.modalidade || 'Não informado' },
        { label: 'Responsável', value: data.responsavelNome || 'Não informado' },
        { label: 'Telefone', value: data.telefone || 'Não informado' },
        { label: 'Assinado em', value: signedDateStr, color: COLOR_PURPLE },
    ];

    // Reutiliza o motor de renderização existente (renderCompositeCard) com a paleta roxa
    // para distinguir visualmente do cartão de novo atleta (azul) e de pagamento (verde).
    return renderCompositeCard({
        headerImage: '/assinar-contrato.png',
        accentColor: COLOR_PURPLE,
        accentBg: COLOR_PURPLE_BG,
        fotoUrl: data.fotoUrl,
        badgeText: '✍️ Contrato Assinado',
        badgeColor: COLOR_PURPLE_BG,
        name: data.nome || 'Aluno',
        subLine: data.modalidade || '',
        statusText: 'Assinatura Digital Confirmada',
        statusColor: COLOR_PURPLE,
        statusBg: COLOR_PURPLE_BG,
        fieldRows,
        noDebtText: 'Contrato com validade jurídica',
        ctaText: 'Clique no link abaixo para visualizar o contrato',
    });
}

/**
 * Chamar logo após o responsável assinar o último contrato pendente de um registro.
 * Envia ao admin um cartão resumindo a assinatura + link direto pro cadastro no painel.
 * Não lança exceção — falha silenciosamente para não bloquear o fluxo do responsável.
 */
export async function notifyAdminContractSigned(data: ContractSignedNotificationData): Promise<void> {
    try {
        const config = await loadAdminNotificationsConfig();
        if (!config.adminPhone) return;

        const image = await renderContractSignedCard(data);
        const nomeUpper = (data.nome || 'Aluno').toUpperCase();
        const text =
            `✍️ *CONTRATO ASSINADO!*\n\n` +
            `*${nomeUpper}*\n` +
            (data.modalidade ? `Modalidade: ${data.modalidade}\n` : '') +
            `Responsável: ${data.responsavelNome || '—'}\n\n` +
            `🔗 Ver cadastro: ${buildApprovalLink(data.registrationId)}`;

        await sendHubMessage(normalizeAdminPhone(config.adminPhone), text, image);
    } catch (e) {
        console.error('Erro ao notificar admin sobre contrato assinado:', e);
    }
}

