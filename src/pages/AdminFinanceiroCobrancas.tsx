import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where, addDoc, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import PageTitle from '../components/PageTitle';
import PageContainer from '../components/PageContainer';
import { RefreshCw, MessageCircle, History, Send, X, ChevronRight, SkipForward, Trash2, CheckCircle2 } from 'lucide-react';

interface Invoice {
    id: string;
    description: string;
    dueDate: string;
    value: number;
    diasAtraso: number;
    isOverdue: boolean;
    invoiceUrl: string;
}

interface Devedor {
    id: string;
    registrationId: string;
    nome: string;
    fotoUrl: string;
    responsavel: string;
    telefone: string;
    modalidade: string;
    invoices: Invoice[];
    totalValue: number;
    maxDiasAtraso: number;
    linkFatura: string;
}

interface HistoryItem {
    id: string;
    alunoNome: string;
    responsavelNome: string;
    telefone: string;
    modalidade?: string;
    valor: number;
    diasAtraso: number;
    mensagem: string;
    enviadoEm: string;
    enviadoPor: string;
}

interface SentInfo {
    count: number;
    lastSentAt: string;
}

const DEFAULT_TEMPLATE = `Olá, {responsavel}! 👋

Identificamos um débito em aberto referente a *{nome}* na Escola de Esportes UBA:

{lista}

Valor: *{valor}*
Atraso: *{dias} dia(s)*

Por favor, regularize o quanto antes para evitar a suspensão das atividades.

Dúvidas? É só responder esta mensagem. 🙏

Link para pagamento: {link}`;

function diffDays(dueDate: string): number {
    if (!dueDate) return 0;
    const due = new Date(dueDate + 'T12:00:00');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    return Math.round((today.getTime() - due.getTime()) / 86400000);
}

function formatBRL(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(dueDate: string): string {
    if (!dueDate) return '—';
    return new Date(dueDate + 'T12:00:00').toLocaleDateString('pt-BR');
}

function buildWaLink(phone: string, text: string): string {
    const clean = (phone || '').replace(/\D/g, '');
    const withCountry = clean.startsWith('55') ? clean : `55${clean}`;
    return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}

function buildInvoiceList(invoices: Invoice[]): string {
    return invoices.map((inv, i) => {
        const status = inv.isOverdue ? `${inv.diasAtraso} dia(s) de atraso` : 'a vencer';
        return `${i + 1}. ${inv.description} — Venc. ${formatDateBR(inv.dueDate)} (${status}) — ${formatBRL(inv.value)}`;
    }).join('\n');
}

// wa.me não permite anexar imagem via link — copiamos o header para a área de transferência
// para o admin colar (Ctrl+V) no WhatsApp antes de enviar o texto.
async function copyHeaderImageToClipboard(url: string): Promise<boolean> {
    try {
        const res = await fetch(url);
        const rawBlob = await res.blob();
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Falha ao carregar imagem'));
            image.src = URL.createObjectURL(rawBlob);
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas indisponível');
        ctx.drawImage(img, 0, 0);
        const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao gerar PNG'))), 'image/png');
        });
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        return true;
    } catch (e) {
        console.error('Erro ao copiar imagem para a área de transferência:', e);
        return false;
    }
}

// A fatura atrasada mais recente (maior vencimento entre as vencidas) é a única cobrada na mensagem.
function getChargeInvoice(d: Devedor): Invoice | undefined {
    const overdueOnly = d.invoices.filter(i => i.isOverdue);
    const source = overdueOnly.length > 0 ? overdueOnly : d.invoices;
    return source[source.length - 1];
}

function chargeKey(registrationId: string, inv?: Invoice): string {
    if (!inv) return '';
    return `${registrationId}|${inv.description}|${inv.dueDate}`;
}

function buildMessage(template: string, d: Devedor): string {
    const chargeInvoice = getChargeInvoice(d);
    return template
        .replace(/{responsavel}/g, (d.responsavel || 'Responsável').trim())
        .replace(/{nome}/g, (d.nome || '').trim())
        .replace(/{valor}/g, formatBRL(chargeInvoice?.value || 0))
        .replace(/{dias}/g, String(chargeInvoice?.diasAtraso || 0))
        .replace(/{lista}/g, chargeInvoice ? buildInvoiceList([chargeInvoice]) : '')
        .replace(/{link}/g, chargeInvoice?.invoiceUrl || d.linkFatura || 'Fale com a secretaria para a segunda via.')
        .replace(/{modalidade}/g, d.modalidade || '');
}

export default function AdminFinanceiroCobrancas() {
    const { showAlert, showConfirm } = useDialog();
    const { user } = useAdminPermissions();
    const workerUrl = import.meta.env.VITE_WORKER_URL;

    const [tab, setTab] = useState<'cobrar' | 'historico'>('cobrar');
    const [devedores, setDevedores] = useState<Devedor[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
    const [showTemplate, setShowTemplate] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

    const [filterOverdue, setFilterOverdue] = useState(true);
    const [filterPending, setFilterPending] = useState(false);

    const [queue, setQueue] = useState<Devedor[] | null>(null);
    const [queueIndex, setQueueIndex] = useState(0);

    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const [sentMap, setSentMap] = useState<Record<string, SentInfo>>({});

    useEffect(() => {
        loadDevedores();
        loadSentMap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterOverdue, filterPending]);

    useEffect(() => {
        if (tab === 'historico') loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    const loadDevedores = async () => {
        setLoading(true);
        try {
            const statuses: string[] = [];
            if (filterOverdue) statuses.push('OVERDUE');
            if (filterPending) statuses.push('PENDING');
            if (statuses.length === 0) {
                setDevedores([]);
                setLoading(false);
                return;
            }

            const paymentsMap = new Map<string, any[]>();
            const paymentsSnap = await getDocs(query(collection(db, 'financial_payments'), where('status', 'in', statuses)));
            paymentsSnap.docs.forEach(d => {
                const pay = d.data();
                if (!pay.studentId) return;
                if (!paymentsMap.has(pay.studentId)) paymentsMap.set(pay.studentId, []);
                paymentsMap.get(pay.studentId)!.push(pay);
            });

            const regSnap = await getDocs(query(
                collection(db, 'uba_2026_registrations'),
                where('contractStatus', '==', 'aprovado')
            ));

            const lista: Devedor[] = [];

            regSnap.docs.forEach(docSnap => {
                const data = docSnap.data();
                const studentPayments = paymentsMap.get(docSnap.id) || [];
                if (studentPayments.length === 0) return;

                const invoices: Invoice[] = studentPayments.map(p => {
                    const dias = diffDays(p.dueDate);
                    return {
                        id: p.id || '',
                        description: (p.description || `Mensalidade ${data.modalidade || 'Esporte'}`).trim(),
                        dueDate: p.dueDate || '',
                        value: Number(p.value || 0),
                        diasAtraso: dias > 0 ? dias : 0,
                        isOverdue: p.status === 'OVERDUE',
                        invoiceUrl: p.invoiceUrl || '',
                    };
                }).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

                const totalValue = invoices.reduce((sum, i) => sum + i.value, 0);
                const maxDiasAtraso = invoices.reduce((max, i) => Math.max(max, i.diasAtraso), 0);
                const withLink = studentPayments.find(p => p.invoiceUrl);
                const responsavelNome = (data.responsavel?.nome || '').trim();
                const telefone = data.responsavel?.telefonePrincipal || '';
                const modalidade = data.modalidade || '';
                const alunos = Array.isArray(data.alunos) ? data.alunos : [];
                const nomeAluno = (alunos[0]?.nome || 'Sem nome').trim();
                const fotoUrl = alunos[0]?.fotoUrl || '';

                if (!telefone) return;

                lista.push({
                    id: docSnap.id,
                    registrationId: docSnap.id,
                    nome: nomeAluno,
                    fotoUrl,
                    responsavel: responsavelNome,
                    telefone,
                    modalidade,
                    invoices,
                    totalValue,
                    maxDiasAtraso,
                    linkFatura: withLink?.invoiceUrl || '',
                });
            });

            lista.sort((a, b) => b.maxDiasAtraso - a.maxDiasAtraso);
            setDevedores(lista);
        } catch (e) {
            console.error('Erro ao buscar devedores:', e);
            showAlert('Erro ao carregar lista de devedores.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadSentMap = async () => {
        try {
            const snap = await getDocs(collection(db, 'manual_charge_logs'));
            const map: Record<string, SentInfo> = {};
            snap.docs.forEach(docSnap => {
                const h = docSnap.data();
                const key = `${h.registrationId}|${h.faturaDescricao}|${h.faturaVencimento}`;
                if (!map[key]) map[key] = { count: 0, lastSentAt: h.enviadoEm || '' };
                map[key].count += 1;
                if ((h.enviadoEm || '') > map[key].lastSentAt) map[key].lastSentAt = h.enviadoEm || '';
            });
            setSentMap(map);
        } catch (e) {
            console.error('Erro ao carregar mapa de envios:', e);
        }
    };

    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'manual_charge_logs'), orderBy('enviadoEm', 'desc'), limit(100)));
            setHistory(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
        } catch (e) {
            console.error('Erro ao buscar histórico:', e);
        } finally {
            setHistoryLoading(false);
        }
    };

    const logSend = async (d: Devedor, mensagem: string) => {
        try {
            const chargeInvoice = getChargeInvoice(d);
            const enviadoEm = new Date().toISOString();
            await addDoc(collection(db, 'manual_charge_logs'), {
                registrationId: d.registrationId,
                alunoNome: d.nome,
                fotoUrl: d.fotoUrl || '',
                responsavelNome: d.responsavel,
                telefone: d.telefone,
                modalidade: d.modalidade,
                valor: chargeInvoice?.value || 0,
                diasAtraso: chargeInvoice?.diasAtraso || 0,
                faturaDescricao: chargeInvoice?.description || '',
                faturaVencimento: chargeInvoice?.dueDate || '',
                mensagem,
                enviadoEm,
                enviadoPor: user?.nome || 'Administrador',
            });

            const key = chargeKey(d.registrationId, chargeInvoice);
            if (key) {
                setSentMap(prev => ({
                    ...prev,
                    [key]: { count: (prev[key]?.count || 0) + 1, lastSentAt: enviadoEm },
                }));
            }
        } catch (e) {
            console.error('Erro ao registrar histórico de envio:', e);
        }
    };

    const handleDeleteHistoryItem = (item: HistoryItem) => {
        showConfirm(`Apagar o registro de envio para ${item.alunoNome}?`, async () => {
            try {
                await deleteDoc(doc(db, 'manual_charge_logs', item.id));
                setHistory(prev => prev.filter(h => h.id !== item.id));
                loadSentMap();
            } catch (e) {
                console.error('Erro ao apagar registro:', e);
                showAlert('Erro ao apagar registro.', 'error');
            }
        });
    };

    const handleOpenWhatsApp = async (d: Devedor) => {
        const text = buildMessage(template, d);
        const copied = await copyHeaderImageToClipboard('/pagamento-atrasado.png');
        window.open(buildWaLink(d.telefone, text), '_blank');
        await logSend(d, text);
        if (copied) {
            showAlert('Imagem copiada! Cole (Ctrl+V) no WhatsApp como cabeçalho antes de enviar a mensagem.', 'success');
        } else {
            showAlert('Não foi possível copiar a imagem automaticamente. Envie a mensagem de texto normalmente.', 'warning');
        }
    };

    const handleMarkAsPaid = (d: Devedor) => {
        const chargeInvoice = getChargeInvoice(d);
        if (!chargeInvoice?.id) {
            showAlert('Não foi possível identificar a fatura no Asaas.', 'error');
            return;
        }
        showConfirm(`Marcar "${chargeInvoice.description}" (${formatBRL(chargeInvoice.value)}) como já paga?`, async () => {
            setMarkingPaidId(d.id);
            try {
                const res = await fetch(`${workerUrl}/payments/${chargeInvoice.id}/receive-in-cash`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentDate: new Date().toISOString().split('T')[0],
                        value: chargeInvoice.value,
                        notify: false,
                    }),
                });
                const data = await res.json();
                if (data.success) {
                    showAlert('Fatura marcada como paga!', 'success');
                    await loadDevedores();
                } else {
                    throw new Error(data.error || 'Erro ao registrar pagamento.');
                }
            } catch (e: any) {
                console.error('Erro ao marcar como pago:', e);
                showAlert(e.message || 'Erro ao marcar como pago.', 'error');
            } finally {
                setMarkingPaidId(null);
            }
        });
    };

    const toggleAll = () => {
        const ids = devedores.map(d => d.id);
        const allSel = ids.every(id => selectedIds.has(id));
        const next = new Set(selectedIds);
        ids.forEach(id => allSel ? next.delete(id) : next.add(id));
        setSelectedIds(next);
    };

    const startQueue = () => {
        const items = devedores.filter(d => selectedIds.has(d.id));
        if (items.length === 0) return showAlert('Selecione ao menos um devedor.', 'warning');
        setQueue(items);
        setQueueIndex(0);
    };

    const currentQueueItem = queue ? queue[queueIndex] : null;

    const handleQueueSend = async () => {
        if (!currentQueueItem) return;
        await handleOpenWhatsApp(currentQueueItem);
        advanceQueue();
    };

    const advanceQueue = () => {
        if (!queue) return;
        if (queueIndex + 1 >= queue.length) {
            setQueue(null);
            setSelectedIds(new Set());
            showAlert('Fila de envio concluída.', 'success');
        } else {
            setQueueIndex(queueIndex + 1);
        }
    };

    const totalSelecionadoValor = useMemo(
        () => devedores.filter(d => selectedIds.has(d.id)).reduce((s, d) => s + (getChargeInvoice(d)?.value || 0), 0),
        [devedores, selectedIds]
    );

    return (
        <PageContainer>
            <PageTitle
                title="COBRANÇA MANUAL"
                subtitle="Envie cobranças de faturas atrasadas pelo WhatsApp Web ou pelo app do seu celular."
            />

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #eee' }}>
                {[
                    { id: 'cobrar', label: 'Cobrar', icon: <Send size={15} /> },
                    { id: 'historico', label: 'Histórico de Envio', icon: <History size={15} /> },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id as any)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 18px',
                            border: 'none',
                            borderBottom: tab === t.id ? '3px solid #c32228' : '3px solid transparent',
                            background: 'transparent',
                            color: tab === t.id ? '#c32228' : '#888',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                        }}
                    >
                        {t.icon}{t.label}
                    </button>
                ))}
            </div>

            {tab === 'cobrar' && (
                <>
                    {/* Queue Modal */}
                    {queue && currentQueueItem && (
                        <div style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 5000,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                        }}>
                            <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <strong style={{ color: '#c32228' }}>Fila de Envio ({queueIndex + 1}/{queue.length})</strong>
                                    <button onClick={() => { setQueue(null); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}>
                                        <X size={20} />
                                    </button>
                                </div>
                                <h3 style={{ margin: '0 0 4px', color: '#333' }}>{currentQueueItem.nome}</h3>
                                <p style={{ margin: '0 0 4px', color: '#666', fontSize: '0.9rem' }}>Responsável: {currentQueueItem.responsavel}</p>
                                <p style={{ margin: '0 0 14px', color: '#666', fontSize: '0.9rem', fontFamily: 'monospace' }}>{currentQueueItem.telefone}</p>
                                <div style={{ background: '#fff5f5', border: '1px solid #f0c0c0', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#888' }}>{getChargeInvoice(currentQueueItem)?.description || 'Fatura a cobrar'}</span>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#c32228' }}>{formatBRL(getChargeInvoice(currentQueueItem)?.value || 0)}</div>
                                    <span style={{ fontSize: '0.78rem', color: '#b3541e' }}>{getChargeInvoice(currentQueueItem)?.diasAtraso || 0} dia(s) de atraso</span>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={advanceQueue} style={btnStyle('#fff', '#888', 'pointer', '1px solid #ddd')}>
                                        <SkipForward size={15} /> Pular
                                    </button>
                                    <button onClick={handleQueueSend} style={{ ...btnStyle('#25D366', '#fff', 'pointer'), flex: 1, justifyContent: 'center' }}>
                                        <MessageCircle size={16} /> Abrir WhatsApp e Avançar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Preview Modal */}
                    {expandedId && (() => {
                        const d = devedores.find(x => x.id === expandedId);
                        if (!d) return null;
                        return (
                            <div
                                onClick={() => setExpandedId(null)}
                                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                            >
                                <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <strong style={{ color: '#c32228' }}>Prévia da Mensagem</strong>
                                        <button onClick={() => setExpandedId(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#888' }}>
                                            <X size={20} />
                                        </button>
                                    </div>
                                    <div style={{ background: '#e5ddd5', borderRadius: '10px', padding: '14px' }}>
                                        <div style={{ background: '#d9fdd3', borderRadius: '8px', padding: '12px', whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: '#111', lineHeight: 1.5 }}>
                                            {buildMessage(template, d)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { handleOpenWhatsApp(d); setExpandedId(null); }}
                                        style={{ ...btnStyle('#25D366', '#fff', 'pointer'), width: '100%', justifyContent: 'center', marginTop: '16px' }}
                                    >
                                        <MessageCircle size={16} /> Abrir WhatsApp
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Filters & Actions */}
                    <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: '16px 20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <span style={{ fontWeight: 600, color: '#475569', fontSize: '0.9rem', display: 'block', marginBottom: '10px' }}>Filtrar exibição:</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                <label style={filterPillStyle(filterOverdue, '#fee2e2', '#fca5a5')}>
                                    <input type="checkbox" checked={filterOverdue} onChange={e => setFilterOverdue(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#ef4444', cursor: 'pointer' }} />
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '0.9rem', fontWeight: filterOverdue ? 600 : 500, color: filterOverdue ? '#991b1b' : '#64748b' }}>Atrasadas</span>
                                        <span style={{ fontSize: '0.7rem', color: filterOverdue ? '#dc2626' : '#94a3b8' }}>Faturas vencidas</span>
                                    </div>
                                </label>
                                <label style={filterPillStyle(filterPending, '#fef3c7', '#fcd34d')}>
                                    <input type="checkbox" checked={filterPending} onChange={e => setFilterPending(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#f59e0b', cursor: 'pointer' }} />
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '0.9rem', fontWeight: filterPending ? 600 : 500, color: filterPending ? '#92400e' : '#64748b' }}>A vencer</span>
                                        <span style={{ fontSize: '0.7rem', color: filterPending ? '#d97706' : '#94a3b8' }}>Ainda dentro do prazo</span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <button onClick={loadDevedores} style={btnStyle('#fff', '#555', 'pointer', '1px solid #ddd')}>
                                    <RefreshCw size={14} /> Atualizar Lista
                                </button>
                                <button onClick={toggleAll} style={btnStyle('#fff', '#555', 'pointer', '1px solid #ddd')}>
                                    {devedores.length > 0 && devedores.every(d => selectedIds.has(d.id)) ? 'Desmarcar Todos' : 'Selecionar Todos'}
                                </button>
                                <button onClick={() => setShowTemplate(!showTemplate)} style={btnStyle('#fff5f5', '#c32228', 'pointer', '1px solid #f0c0c0')}>
                                    ✏️ {showTemplate ? 'Fechar Template' : 'Editar Mensagem'}
                                </button>
                            </div>
                            <button
                                onClick={startQueue}
                                disabled={selectedIds.size === 0}
                                style={btnStyle(selectedIds.size === 0 ? '#e0e0e0' : '#c32228', '#fff', selectedIds.size === 0 ? 'not-allowed' : 'pointer')}
                            >
                                <Send size={15} /> Iniciar Fila de Envio ({selectedIds.size}{selectedIds.size > 0 ? ` · ${formatBRL(totalSelecionadoValor)}` : ''})
                            </button>
                        </div>
                    </div>

                    {showTemplate && (
                        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: '24px', marginBottom: '20px', borderLeft: '4px solid #c32228' }}>
                            <h3 style={{ margin: '0 0 6px', fontSize: '1rem', color: '#333' }}>📝 Template da Cobrança</h3>
                            <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: '12px' }}>
                                Variáveis: <code>{'{responsavel}'}</code>, <code>{'{nome}'}</code>, <code>{'{valor}'}</code>, <code>{'{dias}'}</code>, <code>{'{lista}'}</code>, <code>{'{link}'}</code>, <code>{'{modalidade}'}</code>
                            </p>
                            <textarea
                                value={template}
                                onChange={e => setTemplate(e.target.value)}
                                rows={10}
                                style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.88rem', resize: 'vertical' }}
                            />
                        </div>
                    )}

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Buscando devedores...</div>
                    ) : devedores.length === 0 ? (
                        <div style={{ background: '#fff', borderRadius: '12px', padding: '60px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
                            <h3 style={{ color: '#27ae60', marginBottom: '8px' }}>Nenhum débito encontrado</h3>
                            <p style={{ color: '#888', fontSize: '0.9rem' }}>Todos os alunos aprovados parecem estar em dia.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {devedores.map(d => {
                                const sel = selectedIds.has(d.id);
                                const chargeInvoice = getChargeInvoice(d);
                                const sentInfo = sentMap[chargeKey(d.registrationId, chargeInvoice)];
                                return (
                                    <div key={d.id} style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <input
                                                type="checkbox"
                                                checked={sel}
                                                onChange={() => {
                                                    const next = new Set(selectedIds);
                                                    sel ? next.delete(d.id) : next.add(d.id);
                                                    setSelectedIds(next);
                                                }}
                                                style={{ width: '18px', height: '18px', accentColor: '#c32228', cursor: 'pointer', flexShrink: 0 }}
                                            />
                                            {d.fotoUrl ? (
                                                <img src={d.fotoUrl} alt={d.nome} style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                                            ) : (
                                                <div style={{ width: '44px', height: '44px', borderRadius: '8px', background: '#f5f5f5', color: '#bbb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0 }}>
                                                    {(d.nome || '?').trim().charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <strong style={{ color: '#333' }}>{d.nome}</strong>
                                                    <span style={{ padding: '2px 8px', borderRadius: '20px', background: '#f5f5f5', color: '#555', fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}>
                                                        {d.modalidade || '—'}
                                                    </span>
                                                    {(chargeInvoice?.diasAtraso || 0) > 0 && (
                                                        <span style={{ padding: '2px 8px', borderRadius: '20px', background: '#fee2e2', color: '#991b1b', fontSize: '0.75rem', fontWeight: 700 }}>
                                                            {chargeInvoice?.diasAtraso}d atraso
                                                        </span>
                                                    )}
                                                    {sentInfo ? (
                                                        <span style={{ padding: '2px 8px', borderRadius: '20px', background: '#dbeafe', color: '#1e40af', fontSize: '0.75rem', fontWeight: 700 }}>
                                                            📨 cobrado {sentInfo.count}x
                                                        </span>
                                                    ) : (
                                                        <span style={{ padding: '2px 8px', borderRadius: '20px', background: '#f5f5f5', color: '#999', fontSize: '0.75rem', fontWeight: 600 }}>
                                                            ainda não cobrado
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.82rem', color: '#666', marginTop: '2px' }}>
                                                    {d.responsavel} · <span style={{ fontFamily: 'monospace' }}>{d.telefone}</span>
                                                    {sentInfo && (
                                                        <span style={{ color: '#1e40af' }}> · última cobrança em {new Date(sentInfo.lastSentAt).toLocaleDateString('pt-BR')}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontWeight: 800, color: '#c32228' }}>{formatBRL(chargeInvoice?.value || 0)}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#999', maxWidth: '160px' }}>{chargeInvoice?.description || '—'}</div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', paddingTop: '8px', borderTop: '1px solid #f5f5f5', flexWrap: 'wrap' }}>
                                            <button
                                                onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', border: 'none', background: 'transparent', color: '#555', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                                            >
                                                Ver mensagem <ChevronRight size={14} />
                                            </button>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                <button
                                                    onClick={() => handleMarkAsPaid(d)}
                                                    disabled={markingPaidId === d.id}
                                                    style={btnStyle(markingPaidId === d.id ? '#e0e0e0' : '#fff', '#16a34a', markingPaidId === d.id ? 'not-allowed' : 'pointer', '1px solid #bbf7d0')}
                                                >
                                                    <CheckCircle2 size={16} /> {markingPaidId === d.id ? 'Marcando...' : 'Marcar como Pago'}
                                                </button>
                                                <button
                                                    onClick={() => handleOpenWhatsApp(d)}
                                                    style={btnStyle('#25D366', '#fff', 'pointer')}
                                                >
                                                    <MessageCircle size={16} /> Abrir WhatsApp
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {tab === 'historico' && (
                <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#c32228' }}>{history.length} envio(s) registrado(s)</strong>
                        <button onClick={loadHistory} style={btnStyle('#fff', '#555', 'pointer', '1px solid #ddd')}>
                            <RefreshCw size={14} /> Atualizar
                        </button>
                    </div>
                    {historyLoading ? (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Carregando histórico...</div>
                    ) : history.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Nenhum envio registrado ainda.</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8f9fa' }}>
                                        {['Data', 'Aluno', 'Responsável', 'Telefone', 'Valor', 'Atraso', 'Enviado por', ''].map(h => (
                                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '2px solid #eee', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map(h => (
                                        <tr key={h.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#666' }}>{new Date(h.enviadoEm).toLocaleString('pt-BR')}</td>
                                            <td style={{ padding: '10px 14px', fontWeight: 500 }}>{h.alunoNome}</td>
                                            <td style={{ padding: '10px 14px', color: '#555' }}>{h.responsavelNome}</td>
                                            <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#555' }}>{h.telefone}</td>
                                            <td style={{ padding: '10px 14px', color: '#c32228', fontWeight: 600 }}>{formatBRL(h.valor || 0)}</td>
                                            <td style={{ padding: '10px 14px', color: '#b3541e' }}>{h.diasAtraso || 0}d</td>
                                            <td style={{ padding: '10px 14px', color: '#666' }}>{h.enviadoPor}</td>
                                            <td style={{ padding: '10px 14px' }}>
                                                <button
                                                    onClick={() => handleDeleteHistoryItem(h)}
                                                    title="Apagar registro"
                                                    style={{ border: 'none', background: 'transparent', color: '#c32228', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </PageContainer>
    );
}

function filterPillStyle(active: boolean, bgActive: string, borderActive: string): React.CSSProperties {
    return {
        display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
        padding: '8px 16px', borderRadius: '20px',
        background: active ? bgActive : '#f8fafc',
        border: `1px solid ${active ? borderActive : '#e2e8f0'}`,
        transition: 'all 0.2s',
        userSelect: 'none',
    };
}

function btnStyle(bg: string, color: string, cursor: string, border = 'none'): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '9px 16px', background: bg, color, border,
        borderRadius: '8px', cursor, fontWeight: 600, fontSize: '0.88rem',
        whiteSpace: 'nowrap', transition: 'opacity 0.2s',
    };
}
