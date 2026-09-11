import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, Save, Send, RefreshCw, Check, Clock, CalendarClock, ShieldAlert, Timer } from 'lucide-react';
import PageTitle from '../../components/PageTitle';
import PageContainer from '../../components/PageContainer';
import { useDialog } from '../../context/CustomDialogContext';
import {
    loadAdminNotificationsConfig,
    saveAdminNotificationsConfig,
    sendRegistrationTest,
    sendPaymentTest,
    previewAdminNotification,
    getYesterdaySP,
    previewDailySummary,
    sendDailySummaryTest,
    previewPaymentReminder,
    sendPaymentReminderTest,
    fetchPaymentReminderCount,
    fetchPaymentReminderHistory,
} from '../../utils/adminNotifications';
import type { AdminNotificationsConfig, AdminNotificationType, PaymentReminderRule, PaymentReminderHistoryItem } from '../../utils/adminNotifications';

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

// Converte a formatação simples do WhatsApp (*negrito*) para JSX, preservando quebras de linha.
function renderWhatsAppText(text: string) {
    const lines = text.split('\n');
    return lines.map((line, i) => {
        const parts = line.split(/(\*[^*]+\*)/g).map((part, j) => {
            if (part.startsWith('*') && part.endsWith('*') && part.length > 1) {
                return <strong key={j}>{part.slice(1, -1)}</strong>;
            }
            return <span key={j}>{part}</span>;
        });
        return (
            <span key={i}>
                {parts}
                {i < lines.length - 1 && <br />}
            </span>
        );
    });
}

function Toggle({ active, onClick }: { active: boolean; onClick: () => void }) {
    return (
        <div
            onClick={onClick}
            style={{
                width: '45px',
                height: '24px',
                background: active ? '#27ae60' : '#ccc',
                borderRadius: '12px',
                padding: '2px',
                cursor: 'pointer',
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: active ? 'flex-end' : 'flex-start',
                flexShrink: 0,
            }}
        >
            <div style={{ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
        </div>
    );
}

interface NotificationSectionProps {
    type: AdminNotificationType;
    title: string;
    description: string;
    accentColor: string;
    accentBg: string;
    enabled: boolean;
    onToggle: () => void;
    adminPhone: string;
    onTest: (type: AdminNotificationType) => Promise<{ success: boolean; body: any }>;
}

function NotificationSection({ type, title, description, accentColor, accentBg, enabled, onToggle, adminPhone, onTest }: NotificationSectionProps) {
    const [previewText, setPreviewText] = useState('');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const { showAlert } = useDialog();

    const loadPreview = useCallback(async () => {
        setPreviewLoading(true);
        try {
            const result = await previewAdminNotification(type);
            setPreviewText(result.error || result.text);
            setPreviewImage(result.image);
        } finally {
            setPreviewLoading(false);
        }
    }, [type]);

    useEffect(() => {
        loadPreview();
    }, [loadPreview]);

    const handleTest = async () => {
        if (!adminPhone.trim()) {
            showAlert('Informe o telefone do administrador antes de testar.', 'warning');
            return;
        }
        setTesting(true);
        try {
            const result = await onTest(type);
            showAlert(result.success ? 'Teste enviado! Confira o WhatsApp do administrador.' : 'Erro ao enviar teste.', result.success ? 'success' : 'error');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={{ background: enabled ? accentBg : '#fff', padding: '24px', borderRadius: '16px', border: `1px solid ${enabled ? accentColor + '55' : '#eee'}`, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', transition: 'all 0.3s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ background: accentBg, color: accentColor, padding: '12px', borderRadius: '12px' }}><Bell size={24} /></div>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#333' }}>{title}</div>
                        <div style={{ fontSize: '0.85rem', color: '#777' }}>{description}</div>
                    </div>
                </div>
                <Toggle active={enabled} onClick={onToggle} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Prévia da mensagem</div>
                <button
                    onClick={loadPreview}
                    disabled={previewLoading}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px', cursor: previewLoading ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#555', whiteSpace: 'nowrap' }}
                >
                    <RefreshCw size={13} className={previewLoading ? 'animate-spin' : ''} /> Atualizar
                </button>
            </div>

            <div style={{ background: '#e5ddd5', borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                        background: '#d9fdd3',
                        borderRadius: '10px',
                        borderTopRightRadius: '2px',
                        padding: '4px',
                        maxWidth: '360px',
                        width: '100%',
                        boxShadow: '0 1px 1px rgba(0,0,0,0.12)'
                    }}>
                        {previewImage ? (
                            <img src={previewImage} alt={`Header - ${title}`} style={{ width: '100%', height: 'auto', borderRadius: '7px', display: 'block', marginBottom: '6px' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '0.8rem', borderRadius: '7px', background: '#f1f1f1', marginBottom: '6px' }}>
                                {previewLoading ? 'Gerando imagem...' : 'Imagem indisponível'}
                            </div>
                        )}
                        <div style={{ padding: '4px 6px 6px', fontSize: '0.86rem', color: '#111b21', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                            {previewLoading && !previewText ? 'Carregando...' : renderWhatsAppText(previewText)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', padding: '0 6px 4px' }}>
                            <span style={{ fontSize: '0.68rem', color: '#667781' }}>
                                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <Check size={13} color="#53bdeb" style={{ marginLeft: '-8px' }} />
                            <Check size={13} color="#53bdeb" />
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={handleTest}
                disabled={testing || !adminPhone.trim()}
                style={{
                    width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px',
                    background: '#fff', border: `2px solid ${accentColor}`, color: accentColor, borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.9rem',
                    cursor: (testing || !adminPhone.trim()) ? 'not-allowed' : 'pointer',
                    opacity: (testing || !adminPhone.trim()) ? 0.5 : 1
                }}
            >
                <Send size={15} /> {testing ? 'Enviando teste...' : `Testar Isoladamente (${title})`}
            </button>
        </div>
    );
}

interface DailySummarySectionProps {
    config: AdminNotificationsConfig;
    onToggle: () => void;
    onTimeChange: (time: string) => void;
}

function DailySummarySection({ config, onToggle, onTimeChange }: DailySummarySectionProps) {
    const accentColor = '#b45309';
    const accentBg = '#fffbeb';
    const [testDate, setTestDate] = useState(getYesterdaySP());
    const [previewText, setPreviewText] = useState('');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const { showAlert } = useDialog();

    const loadPreview = useCallback(async (dateStr: string) => {
        setPreviewLoading(true);
        try {
            const data = await previewDailySummary(dateStr);
            setPreviewText(data?.text || '');
            setPreviewImage(data?.imageUrl || null);
        } finally {
            setPreviewLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPreview(testDate);
    }, [loadPreview, testDate]);

    const handleTest = async () => {
        if (!config.adminPhone.trim()) {
            showAlert('Informe o telefone do administrador antes de testar.', 'warning');
            return;
        }
        setTesting(true);
        try {
            const result = await sendDailySummaryTest(config, testDate);
            showAlert(result.success ? 'Teste enviado! Confira o WhatsApp do administrador.' : 'Erro ao enviar teste.', result.success ? 'success' : 'error');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={{ background: config.dailySummaryEnabled ? accentBg : '#fff', padding: '24px', borderRadius: '16px', border: `1px solid ${config.dailySummaryEnabled ? accentColor + '55' : '#eee'}`, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', transition: 'all 0.3s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ background: accentBg, color: accentColor, padding: '12px', borderRadius: '12px' }}><CalendarClock size={24} /></div>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#333' }}>Resumo Diário</div>
                        <div style={{ fontSize: '0.85rem', color: '#777' }}>Envia, todo dia no horário abaixo, o resumo do dia anterior completo (00:00 às 23:59): caixa, financeiro do mês, cadastros e pagamentos.</div>
                    </div>
                </div>
                <Toggle active={config.dailySummaryEnabled} onClick={onToggle} />
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    <Clock size={14} /> Horário do envio automático
                </label>
                <input
                    type="time"
                    value={config.dailySummaryTime}
                    onChange={e => onTimeChange(e.target.value)}
                    style={{ padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '1rem', outline: 'none', fontFamily: 'monospace' }}
                />
                <p style={{ margin: '8px 0 0', fontSize: '0.79rem', color: '#999' }}>
                    Todo dia, nesse horário, é enviado o resumo referente ao dia anterior (usa o número do administrador configurado acima).
                </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Prévia da mensagem</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '0.78rem', color: '#666', fontWeight: 700 }}>Data de teste:</label>
                    <input
                        type="date"
                        value={testDate}
                        onChange={e => setTestDate(e.target.value)}
                        style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.82rem', fontFamily: 'monospace' }}
                    />
                    <button
                        onClick={() => loadPreview(testDate)}
                        disabled={previewLoading}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px', cursor: previewLoading ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#555', whiteSpace: 'nowrap' }}
                    >
                        <RefreshCw size={13} className={previewLoading ? 'animate-spin' : ''} /> Atualizar
                    </button>
                </div>
            </div>

            <div style={{ background: '#e5ddd5', borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                        background: '#d9fdd3',
                        borderRadius: '10px',
                        borderTopRightRadius: '2px',
                        padding: '4px',
                        maxWidth: '360px',
                        width: '100%',
                        boxShadow: '0 1px 1px rgba(0,0,0,0.12)'
                    }}>
                        {previewImage ? (
                            <img src={previewImage} alt="Header - Resumo Diário" style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '7px', display: 'block', marginBottom: '6px' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '0.8rem', borderRadius: '7px', background: '#f1f1f1', marginBottom: '6px' }}>
                                {previewLoading ? 'Gerando imagem...' : 'Imagem indisponível'}
                            </div>
                        )}
                        <div style={{ padding: '4px 6px 6px', fontSize: '0.86rem', color: '#111b21', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                            {previewLoading && !previewText ? 'Carregando...' : renderWhatsAppText(previewText)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', padding: '0 6px 4px' }}>
                            <span style={{ fontSize: '0.68rem', color: '#667781' }}>
                                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <Check size={13} color="#53bdeb" style={{ marginLeft: '-8px' }} />
                            <Check size={13} color="#53bdeb" />
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={handleTest}
                disabled={testing || !config.adminPhone.trim()}
                style={{
                    width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px',
                    background: '#fff', border: `2px solid ${accentColor}`, color: accentColor, borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.9rem',
                    cursor: (testing || !config.adminPhone.trim()) ? 'not-allowed' : 'pointer',
                    opacity: (testing || !config.adminPhone.trim()) ? 0.5 : 1
                }}
            >
                <Send size={15} /> {testing ? 'Enviando teste...' : `Testar Isoladamente (Resumo de ${testDate.split('-').reverse().join('/')})`}
            </button>
        </div>
    );
}

const RULE_LABELS: Record<PaymentReminderRule, { title: string; description: string }> = {
    BEFORE: { title: 'Antes do Vencimento', description: 'Lembrete preventivo, alguns dias antes da fatura vencer.' },
    ONDAY: { title: 'Pagamento é Hoje', description: 'Avisa o responsável no exato dia do vencimento da fatura.' },
    AFTER: { title: 'Pagamento Atrasado', description: 'Cobra o responsável quando a fatura consta como atrasada.' },
};

interface PaymentReminderRuleCardProps {
    rule: PaymentReminderRule;
    enabled: boolean;
    onToggle: () => void;
    days?: number;
    onDaysChange?: (days: number) => void;
    redirectActive: boolean;
}

function PaymentReminderRuleCard({ rule, enabled, onToggle, days, onDaysChange, redirectActive }: PaymentReminderRuleCardProps) {
    const accentColor = '#7c3aed';
    const accentBg = '#f5f3ff';
    const [previewText, setPreviewText] = useState<string | null>(null);
    const [previewStudent, setPreviewStudent] = useState<string | null>(null);
    const [previewMessage, setPreviewMessage] = useState<string | undefined>(undefined);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const { showAlert } = useDialog();
    const { title, description } = RULE_LABELS[rule];

    const loadPreview = useCallback(async () => {
        setPreviewLoading(true);
        try {
            const data = await previewPaymentReminder(rule);
            setPreviewText(data.text);
            setPreviewStudent(data.studentName);
            setPreviewMessage(data.message);
        } finally {
            setPreviewLoading(false);
        }
    }, [rule]);

    useEffect(() => {
        loadPreview();
    }, [loadPreview]);

    const handleTest = async () => {
        setTesting(true);
        try {
            const result = await sendPaymentReminderTest(rule);
            if (!result.success && !result.text) {
                showAlert(result.error || 'Não há dados reais suficientes para simular esse teste agora.', 'warning');
            } else {
                showAlert(
                    result.success
                        ? `Teste enviado${result.redirected ? ' (redirecionado para o admin)' : ' para o responsável real'}! Aluno usado como exemplo: ${result.studentName}.`
                        : (result.sendError || 'Erro ao enviar teste.'),
                    result.success ? 'success' : 'error'
                );
            }
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={{ background: enabled ? accentBg : '#fff', padding: '20px', borderRadius: '14px', border: `1px solid ${enabled ? accentColor + '55' : '#eee'}`, transition: 'all 0.3s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#333' }}>{title}</div>
                    <div style={{ fontSize: '0.82rem', color: '#777' }}>{description}</div>
                </div>
                <Toggle active={enabled} onClick={onToggle} />
            </div>

            {onDaysChange && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <span style={{ fontSize: '0.88rem', color: '#555' }}>{rule === 'BEFORE' ? 'Enviar' : 'Enviar'}</span>
                    <input
                        type="number"
                        min={1}
                        value={days}
                        onChange={e => onDaysChange(parseInt(e.target.value) || 1)}
                        style={{ width: '65px', padding: '8px', borderRadius: '8px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}
                    />
                    <span style={{ fontSize: '0.88rem', color: '#555' }}>{rule === 'BEFORE' ? 'dias antes do vencimento.' : 'dias após o atraso.'}</span>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '10px' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    Prévia (aluno real aprovado){previewStudent ? `: ${previewStudent}` : ''}
                </div>
                <button
                    onClick={loadPreview}
                    disabled={previewLoading}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px', cursor: previewLoading ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 700, color: '#555' }}
                >
                    <RefreshCw size={12} className={previewLoading ? 'animate-spin' : ''} /> Atualizar
                </button>
            </div>

            <div style={{ background: '#e5ddd5', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ background: '#d9fdd3', borderRadius: '10px', borderTopRightRadius: '2px', padding: '8px 10px', maxWidth: '360px', width: '100%', boxShadow: '0 1px 1px rgba(0,0,0,0.12)' }}>
                        <div style={{ fontSize: '0.85rem', color: '#111b21', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                            {previewLoading ? 'Carregando...' : (previewText ? renderWhatsAppText(previewText) : (previewMessage || 'Sem fatura real batendo com essa regra hoje.'))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.68rem', color: '#667781' }}>
                                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <Check size={13} color="#53bdeb" style={{ marginLeft: '-8px' }} />
                            <Check size={13} color="#53bdeb" />
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={handleTest}
                disabled={testing}
                style={{
                    width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px',
                    background: '#fff', border: `2px solid ${accentColor}`, color: accentColor, borderRadius: '10px',
                    fontWeight: 700, fontSize: '0.88rem',
                    cursor: testing ? 'not-allowed' : 'pointer',
                    opacity: testing ? 0.5 : 1
                }}
            >
                <Send size={14} /> {testing ? 'Enviando teste...' : `Testar Isoladamente (${title})`}
            </button>
            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: redirectActive ? '#b45309' : '#c32228', fontWeight: 700 }}>
                {redirectActive
                    ? '🧪 Modo teste ativo: este envio vai para o número do admin, não para o responsável real.'
                    : '⚠️ Modo teste desligado: este envio vai direto para o WhatsApp real do responsável.'}
            </p>
        </div>
    );
}

function formatHistoryTimestamp(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function HistoryTab() {
    const [items, setItems] = useState<PaymentReminderHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems(await fetchPaymentReminderHistory());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <button
                    onClick={load}
                    disabled={loading}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#555' }}
                >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '0.9rem' }}>Carregando histórico...</div>
            ) : items.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontSize: '0.9rem' }}>Nenhum lembrete foi enviado ainda.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#f8f9fa', borderRadius: '10px', border: '1px solid #eee' }}>
                            {item.studentPhoto ? (
                                <img src={item.studentPhoto} alt={item.studentName} style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#e5e7eb', flexShrink: 0 }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#333' }}>{item.studentName || 'Aluno'}</div>
                                <div style={{ fontSize: '0.78rem', color: '#777' }}>
                                    {RULE_LABELS[item.rule as PaymentReminderRule]?.title || item.rule} · {formatHistoryTimestamp(item.sentAt)}
                                    {item.redirected && ' · redirecionado p/ admin'}
                                    {item.isTest && ' · teste'}
                                </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: item.success ? '#15803d' : '#c32228' }}>
                                {item.success ? 'Enviado' : 'Falhou'}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface PaymentReminderSectionProps {
    config: AdminNotificationsConfig;
    set: (field: keyof AdminNotificationsConfig, value: any) => void;
}

function PaymentReminderSection({ config, set }: PaymentReminderSectionProps) {
    const [tab, setTab] = useState<'config' | 'historico'>('config');
    const [count, setCount] = useState<number | null>(null);
    const [countByRule, setCountByRule] = useState<Partial<Record<PaymentReminderRule, number>>>({});
    const [countLoading, setCountLoading] = useState(false);

    useEffect(() => {
        setCountLoading(true);
        const timer = window.setTimeout(async () => {
            const result = await fetchPaymentReminderCount({
                paymentReminderBeforeEnabled: config.paymentReminderBeforeEnabled,
                paymentReminderBeforeDays: config.paymentReminderBeforeDays,
                paymentReminderOnDayEnabled: config.paymentReminderOnDayEnabled,
                paymentReminderAfterEnabled: config.paymentReminderAfterEnabled,
                paymentReminderAfterDays: config.paymentReminderAfterDays,
            });
            setCount(result.success ? result.count : null);
            setCountByRule(result.byRule);
            setCountLoading(false);
        }, 500);
        return () => window.clearTimeout(timer);
    }, [
        config.paymentReminderBeforeEnabled, config.paymentReminderBeforeDays,
        config.paymentReminderOnDayEnabled,
        config.paymentReminderAfterEnabled, config.paymentReminderAfterDays,
    ]);

    const anyEnabled = config.paymentReminderBeforeEnabled || config.paymentReminderOnDayEnabled || config.paymentReminderAfterEnabled;

    return (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #eee', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ background: '#f5f3ff', color: '#7c3aed', padding: '12px', borderRadius: '12px' }}><Bell size={24} /></div>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#333' }}>Lembretes de Pagamento aos Responsáveis</div>
                        <div style={{ fontSize: '0.85rem', color: '#777' }}>Avisa o responsável do aluno sobre o vencimento das mensalidades (não vai para o admin).</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', background: '#f8f9fa', padding: '4px', borderRadius: '10px', border: '1px solid #eee' }}>
                    <button
                        onClick={() => setTab('config')}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', background: tab === 'config' ? '#fff' : 'transparent', color: tab === 'config' ? '#7c3aed' : '#777', boxShadow: tab === 'config' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                    >
                        Configuração
                    </button>
                    <button
                        onClick={() => setTab('historico')}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', background: tab === 'historico' ? '#fff' : 'transparent', color: tab === 'historico' ? '#7c3aed' : '#777', boxShadow: tab === 'historico' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                    >
                        Histórico
                    </button>
                </div>
            </div>

            {tab === 'historico' ? (
                <HistoryTab />
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                <Clock size={14} /> Início do envio
                            </label>
                            <input
                                type="time"
                                value={config.paymentReminderSendTime}
                                onChange={e => set('paymentReminderSendTime', e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '1rem', outline: 'none', fontFamily: 'monospace' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                <Clock size={14} /> Fim do envio
                            </label>
                            <input
                                type="time"
                                value={config.paymentReminderSendEndTime}
                                onChange={e => set('paymentReminderSendEndTime', e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '1rem', outline: 'none', fontFamily: 'monospace' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: '#666', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                <Timer size={14} /> Intervalo (segundos)
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={config.paymentReminderIntervalSeconds}
                                onChange={e => set('paymentReminderIntervalSeconds', parseInt(e.target.value) || 1)}
                                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '1rem', outline: 'none', fontFamily: 'monospace' }}
                            />
                        </div>
                    </div>
                    <p style={{ margin: '0 0 20px', fontSize: '0.79rem', color: '#999' }}>
                        Fora dessa janela de horário, o envio automático não dispara mensagens novas - retoma no dia seguinte.
                    </p>

                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', borderRadius: '10px', marginBottom: '20px',
                        background: anyEnabled ? '#f5f3ff' : '#f8f9fa', border: `1px solid ${anyEnabled ? '#ddd6fe' : '#eee'}`
                    }}>
                        <Send size={16} color={anyEnabled ? '#7c3aed' : '#999'} />
                        {countLoading ? (
                            <span style={{ fontSize: '0.88rem', color: '#777' }}>Calculando...</span>
                        ) : !anyEnabled ? (
                            <span style={{ fontSize: '0.88rem', color: '#777' }}>Nenhuma regra ativa - ligue ao menos uma abaixo para ver a estimativa.</span>
                        ) : count === null ? (
                            <span style={{ fontSize: '0.88rem', color: '#c32228' }}>Não foi possível calcular a estimativa agora.</span>
                        ) : (
                            <span style={{ fontSize: '0.88rem', color: '#333' }}>
                                <strong>{count}</strong> {count === 1 ? 'mensagem seria enviada' : 'mensagens seriam enviadas'} hoje
                                {count > 0 && ` (${(['BEFORE', 'ONDAY', 'AFTER'] as PaymentReminderRule[])
                                    .filter(r => countByRule[r])
                                    .map(r => `${countByRule[r]} ${RULE_LABELS[r].title.toLowerCase()}`)
                                    .join(', ')})`}
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <PaymentReminderRuleCard
                            rule="BEFORE"
                            enabled={config.paymentReminderBeforeEnabled}
                            onToggle={() => set('paymentReminderBeforeEnabled', !config.paymentReminderBeforeEnabled)}
                            days={config.paymentReminderBeforeDays}
                            onDaysChange={(d) => set('paymentReminderBeforeDays', d)}
                            redirectActive={config.redirectParentMessagesToAdmin}
                        />
                        <PaymentReminderRuleCard
                            rule="ONDAY"
                            enabled={config.paymentReminderOnDayEnabled}
                            onToggle={() => set('paymentReminderOnDayEnabled', !config.paymentReminderOnDayEnabled)}
                            redirectActive={config.redirectParentMessagesToAdmin}
                        />
                        <PaymentReminderRuleCard
                            rule="AFTER"
                            enabled={config.paymentReminderAfterEnabled}
                            onToggle={() => set('paymentReminderAfterEnabled', !config.paymentReminderAfterEnabled)}
                            days={config.paymentReminderAfterDays}
                            onDaysChange={(d) => set('paymentReminderAfterDays', d)}
                            redirectActive={config.redirectParentMessagesToAdmin}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

export default function AdminMensagensAvisosAdmin() {
    const [config, setConfig] = useState<AdminNotificationsConfig>(EMPTY_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { showAlert } = useDialog();
    const navigate = useNavigate();

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const data = await loadAdminNotificationsConfig();
            setConfig(data);
            setLoading(false);
        };
        load();
    }, []);

    const set = (field: keyof AdminNotificationsConfig, value: any) =>
        setConfig(prev => ({ ...prev, [field]: value }));

    const handleSave = async () => {
        setSaving(true);
        const success = await saveAdminNotificationsConfig(config);
        setSaving(false);
        showAlert(success ? 'Configurações salvas!' : 'Erro ao salvar.', success ? 'success' : 'error');
    };

    const runTest = async (type: AdminNotificationType) => {
        return type === 'registration' ? sendRegistrationTest(config) : sendPaymentTest(config);
    };

    if (loading) {
        return (
            <PageContainer>
                <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
                    <div style={{ color: '#666', fontSize: '1.2rem' }}>Carregando configurações...</div>
                </div>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                <button
                    onClick={() => navigate('/admin/dashboard')}
                    style={{ background: '#f8f9fa', border: '1px solid #ddd', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#666' }}
                >
                    <ChevronLeft size={20} />
                </button>
                <PageTitle
                    title="AVISOS AO ADMINISTRADOR"
                    subtitle="Configure o número do admin e teste cada tipo de aviso isoladamente."
                />
            </div>

            <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Toggle de segurança global - redireciona TODO envio a responsáveis pro admin */}
                <div style={{
                    background: config.redirectParentMessagesToAdmin ? '#fffbeb' : '#fff5f5',
                    padding: '22px 24px', borderRadius: '16px',
                    border: `2px solid ${config.redirectParentMessagesToAdmin ? '#f59e0b' : '#c32228'}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ background: config.redirectParentMessagesToAdmin ? '#fef3c7' : '#ffe3e3', color: config.redirectParentMessagesToAdmin ? '#b45309' : '#c32228', padding: '12px', borderRadius: '12px' }}>
                            <ShieldAlert size={26} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#333' }}>
                                Modo Teste: redirecionar envios a responsáveis para o admin
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '2px' }}>
                                {config.redirectParentMessagesToAdmin
                                    ? 'LIGADO: nenhuma mensagem para responsáveis (lembretes de pagamento e confirmação de pagamento) sai daqui — tudo vai para o número do admin acima.'
                                    : 'DESLIGADO: lembretes de pagamento e confirmações vão direto para o WhatsApp real dos responsáveis.'}
                            </div>
                        </div>
                    </div>
                    <Toggle active={config.redirectParentMessagesToAdmin} onClick={() => set('redirectParentMessagesToAdmin', !config.redirectParentMessagesToAdmin)} />
                </div>

                {/* Número do administrador */}
                <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #eee', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#666', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        Número do administrador (com DDD)
                    </label>
                    <input
                        type="tel"
                        placeholder="Ex: 5533998200546"
                        value={config.adminPhone}
                        onChange={e => set('adminPhone', e.target.value)}
                        style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '1rem', outline: 'none', fontFamily: 'monospace' }}
                    />
                    <p style={{ margin: '8px 0 0', fontSize: '0.79rem', color: '#999' }}>
                        Esse é o número que vai receber os avisos abaixo, via o serviço de mensageria (hub).
                    </p>
                </div>

                {/* Aviso: novo atleta cadastrado */}
                <NotificationSection
                    type="registration"
                    title="Novo Atleta Cadastrado"
                    description="Envia um aviso ao administrador assim que uma inscrição é recebida pelo formulário público."
                    accentColor="#1d4ed8"
                    accentBg="#eff6ff"
                    enabled={config.notifyOnRegistration}
                    onToggle={() => set('notifyOnRegistration', !config.notifyOnRegistration)}
                    adminPhone={config.adminPhone}
                    onTest={runTest}
                />

                {/* Aviso: pagamento identificado */}
                <NotificationSection
                    type="payment"
                    title="Pagamento Identificado"
                    description="Envia um aviso ao administrador quando a sincronização financeira detecta que uma cobrança foi paga."
                    accentColor="#15803d"
                    accentBg="#f0fdf4"
                    enabled={config.notifyOnPayment}
                    onToggle={() => set('notifyOnPayment', !config.notifyOnPayment)}
                    adminPhone={config.adminPhone}
                    onTest={runTest}
                />

                {/* Resumo diário automático */}
                <DailySummarySection
                    config={config}
                    onToggle={() => set('dailySummaryEnabled', !config.dailySummaryEnabled)}
                    onTimeChange={(time) => set('dailySummaryTime', time)}
                />

                {/* Lembretes de pagamento aos responsáveis */}
                <PaymentReminderSection config={config} set={set} />

                {/* Ações */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '10px' }}>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '13px 30px',
                            background: saving ? '#ddd' : '#c32228', color: '#fff', border: 'none', borderRadius: '10px',
                            fontWeight: 700, fontSize: '0.95rem', cursor: saving ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                </div>
            </div>
        </PageContainer>
    );
}
