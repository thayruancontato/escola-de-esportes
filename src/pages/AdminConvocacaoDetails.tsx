import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useLoading } from '../components/LoadingService';
import { useDialog } from '../context/CustomDialogContext';
import { ArrowLeft, Save, Plus, Users, Search, X, Trophy, GripVertical, ArrowRightLeft, Trash2, Image as ImageIcon, MessageCircle, Wifi, WifiOff, RefreshCw, Send, Download } from 'lucide-react';
import { useDashboardData } from './AdminDashboard/hooks/useDashboardData';
import type { Convocacao, ConvocacaoJogador } from '../types/convocacao';
import { ensureInstance, INSTANCE_NAME, resolveWhatsAppApiKey, sendWhatsApp, WHATSAPP_SERVICE_URL } from './AdminMensagens/whatsappUtils';
import type { WhatsAppFullConfig } from './AdminMensagens/whatsappUtils';
import { useConvocacaoImageGenerator } from '../hooks/useConvocacaoImageGenerator';

import { ConvocacaoImageModal } from '../components/ConvocacaoImageModal';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableJogadorItemProps {
    id: string;
    jogador: ConvocacaoJogador;
    showNumbers: boolean;
    onRemove: (id: string) => void;
    onSwap: (id: string) => void;
}

type WhatsAppStatus = 'CHECKING' | 'CONNECTED' | 'DISCONNECTED';

type ConvocacaoWhatsAppRecipient = {
    id: string;
    jogador: ConvocacaoJogador;
    responsavel: string;
    phone: string;
    formattedPhone: string;
    message: string;
};

type ConvocacaoSendLog = {
    id: string;
    name: string;
    phone: string;
    status: 'pending' | 'sending' | 'success' | 'error';
    log: string;
};

const WHATSAPP_QR_REFRESH_MS = 15000;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function formatConvocacaoDate(dateInput: string) {
    if (!dateInput) return 'Data a confirmar';
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return 'Data a confirmar';
    return date.toLocaleString('pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function normalizeQrCode(rawQr?: string | null) {
    if (!rawQr) return null;
    if (rawQr.startsWith('data:image')) return rawQr;
    if (rawQr.startsWith('http')) return rawQr;
    return `data:image/png;base64,${rawQr}`;
}

function SortableJogadorItem({ id, jogador, showNumbers, onRemove, onSwap }: SortableJogadorItemProps) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={{ ...style, display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '12px 15px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: '#ccc', marginRight: '15px' }}>
                <GripVertical size={20} />
            </div>

            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f5f5f5', overflow: 'hidden', marginRight: '15px', flexShrink: 0 }}>
                {jogador.photo ? <img src={jogador.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Users size={20} color="#ccc" style={{ margin: '10px' }} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                    to={window.location.pathname.startsWith('/professor')
                        ? `/professor/aluno/${jogador.regId || jogador.id.split('_')[0]}/${jogador.id.includes('_') ? jogador.id.split('_')[1] : '0'}`
                        : `/admin/details/${jogador.regId || jogador.id.split('_')[0]}`
                    }
                    style={{ fontWeight: '800', color: '#c32228', textDecoration: 'underline', textTransform: 'uppercase', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                >
                    {jogador.nome}
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>{jogador.turma || 'Sem Turma'}</div>
                    {!jogador.numero && showNumbers && (
                        <Link
                            to={window.location.pathname.startsWith('/professor')
                                ? `/professor/aluno/${jogador.regId || jogador.id.split('_')[0]}/${jogador.id.includes('_') ? jogador.id.split('_')[1] : '0'}`
                                : `/admin/details/${jogador.regId || jogador.id.split('_')[0]}`
                            }
                            style={{
                                fontSize: '0.65rem',
                                color: '#c32228',
                                fontWeight: 'bold',
                                background: '#fff1f0',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                border: '1px solid #ffa39e',
                                textDecoration: 'none'
                            }}
                        >
                            Sem número +Adicionar
                        </Link>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                {showNumbers && (
                    jogador.numero ? (
                        <div style={{
                            width: '45px',
                            padding: '6px 4px',
                            textAlign: 'center',
                            border: '2px solid #c32228',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            background: '#fff',
                            color: '#333'
                        }}>
                            {jogador.numero}
                        </div>
                    ) : (
                        <div style={{ width: '45px' }} />
                    )
                )}
                <button onClick={(e) => { e.stopPropagation(); onSwap(id); }} title="Mover Categoria" style={{ background: '#f0f0f0', border: 'none', padding: '8px', borderRadius: '6px', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowRightLeft size={16} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); onRemove(id); }} title="Remover" style={{ background: '#fff1f0', border: 'none', padding: '8px', borderRadius: '6px', color: '#cf1322', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
}




export default function AdminConvocacaoDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { setLoading } = useLoading();
    const { showAlert, showConfirm } = useDialog();
    const location = useLocation();
    const isTeacherPortal = location.pathname.startsWith('/professor');
    const pathPrefix = isTeacherPortal ? '/professor' : '/admin';

    const [convocacao, setConvocacao] = useState<Convocacao | null>(null);
    const [jogadores, setJogadores] = useState<ConvocacaoJogador[]>([]);
    const [jogoNome, setJogoNome] = useState('');
    const [tecnico, setTecnico] = useState('');
    const [rivalNome, setRivalNome] = useState('');
    const [rivalLogo, setRivalLogo] = useState('');
    const [casaNome, setCasaNome] = useState('');
    const [casaLogo, setCasaLogo] = useState('');
    const [showNumbers, setShowNumbers] = useState(true);
    const [dataJogo, setDataJogo] = useState('');
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    // Switches para campos opcionais
    const [useDataJogo, setUseDataJogo] = useState(false);
    const [useTecnico, setUseTecnico] = useState(false);
    const [useCasaInfo, setUseCasaInfo] = useState(false);
    const [useRivalInfo, setUseRivalInfo] = useState(false);

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);


    const isMobile = windowWidth < 1024; // Aumentado para cobrir tablets e evitar scroll horizontal

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchModalidade, setSearchModalidade] = useState('futebol');
    const { allStudents, turmas, loading: studentsLoading } = useDashboardData();
    const [isWhatsAppPanelOpen, setIsWhatsAppPanelOpen] = useState(false);
    const [whatsAppConfig, setWhatsAppConfig] = useState<WhatsAppFullConfig | null>(null);
    const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus>('CHECKING');
    const [whatsAppQrCode, setWhatsAppQrCode] = useState<string | null>(null);
    const [whatsAppSending, setWhatsAppSending] = useState(false);
    const [whatsAppSendLogs, setWhatsAppSendLogs] = useState<ConvocacaoSendLog[]>([]);
    const [whatsAppProgress, setWhatsAppProgress] = useState({ current: 0, total: 0 });
    const [whatsAppPanelError, setWhatsAppPanelError] = useState('');
    const [whatsAppQrUpdatedAt, setWhatsAppQrUpdatedAt] = useState<Date | null>(null);
    const [whatsAppQrRefreshing, setWhatsAppQrRefreshing] = useState(false);
    const [whatsAppPanelTab, setWhatsAppPanelTab] = useState<'send' | 'test'>('send');
    const [whatsAppTestPhone, setWhatsAppTestPhone] = useState('');
    const [whatsAppTestModelId, setWhatsAppTestModelId] = useState('');
    const [whatsAppTestStatus, setWhatsAppTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const [whatsAppTestLog, setWhatsAppTestLog] = useState('');
    const [whatsAppSendMode, setWhatsAppSendMode] = useState<'manual' | 'auto'>('manual');
    const [manualSentIds, setManualSentIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (whatsAppSendMode !== 'auto' || !isWhatsAppPanelOpen || whatsAppSending || whatsAppStatus === 'CONNECTED' || !whatsAppConfig?.apiKey) return;

        const timer = window.setInterval(() => {
            checkWhatsAppStatus(whatsAppConfig.apiKey, false);
        }, 5000);

        return () => window.clearInterval(timer);
    }, [whatsAppSendMode, isWhatsAppPanelOpen, whatsAppSending, whatsAppStatus, whatsAppConfig?.apiKey]);

    useEffect(() => {
        if (whatsAppSendMode !== 'auto' || !isWhatsAppPanelOpen || whatsAppStatus === 'CONNECTED' || !whatsAppConfig?.apiKey) return;

        const timer = window.setInterval(() => {
            fetchWhatsAppQrCode(whatsAppConfig.apiKey, true);
        }, WHATSAPP_QR_REFRESH_MS);

        return () => window.clearInterval(timer);
    }, [whatsAppSendMode, isWhatsAppPanelOpen, whatsAppStatus, whatsAppConfig?.apiKey]);

    // Auto-sync missing player numbers from student database
    useEffect(() => {
        if (jogadores.length > 0 && allStudents.length > 0) {
            let changed = false;
            const updatedJogadores = jogadores.map(j => {
                // If player has no number in convocation, look for it in allStudents
                if (!j.numero) {
                    const student = allStudents.find(s => s.uniqueId === j.id);
                    if ((student?.aluno as any)?.camisa) {
                        changed = true;
                        return { ...j, numero: (student!.aluno as any).camisa };
                    }
                }
                return j;
            });

            if (changed) {
                console.log("Auto-syced jersey numbers from student database");
                setJogadores(updatedJogadores);
            }
        }
    }, [allStudents, jogadores.length]);


    const activeModalidades = useMemo(() => {
        const mods = new Set(allStudents.map(s => s.modalidade).filter(Boolean));
        const list = Array.from(mods).map(m => {
            const label = m?.charAt(0).toUpperCase() + (m?.slice(1) || '');
            let icon = '🎯';
            if (m?.includes('futebol')) icon = '⚽';
            if (m?.includes('volei')) icon = '🏐';
            if (m?.includes('natacao')) icon = '🏊';
            if (m?.includes('hidro')) icon = '🌊';
            if (m?.includes('danca')) icon = '💃';
            if (m?.includes('artes')) icon = '🥋';
            return { id: m as string, label, icon };
        });
        // Se futebol não estiver na lista mas existir futebol no sistema, garantir que o ID bata
        return list.length > 0 ? list : [{ id: 'futebol', label: 'Futebol', icon: '⚽' }];
    }, [allStudents]);

    useEffect(() => {
        if (activeModalidades.length > 0 && !activeModalidades.find(m => m.id === searchModalidade)) {
            // Se o atual não existe, e existe futebol, mantém futebol ou pega o primeiro
            const hasFutebol = activeModalidades.find(m => m.id === 'futebol');
            if (hasFutebol) setSearchModalidade('futebol');
            else setSearchModalidade(activeModalidades[0].id);
        }
    }, [activeModalidades, searchModalidade]);

    // Raffle and Image modal states
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    // Prévia da imagem geral, gerada automaticamente ao entrar na página e a cada alteração
    const { generateImage, downloadImage } = useConvocacaoImageGenerator();
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [isDownloadingImage, setIsDownloadingImage] = useState(false);

    // Dnd-kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        if (id) fetchConvocacao();
    }, [id]);

    const fetchConvocacao = async () => {
        try {
            setLoading(true, 'Carregando detalhes...');
            const docRef = doc(db, 'uba_2026_convocacoes', id as string);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = { id: snap.id, ...snap.data() } as Convocacao;
                setConvocacao(data);
                setJogadores(data.jogadores || []);
                setJogoNome(data.jogo || '');
                setTecnico(data.tecnico || '');
                setUseTecnico(!!data.tecnico);
                setRivalNome(data.rivalNome || '');
                setRivalLogo(data.rivalLogo || '');
                setUseRivalInfo(!!data.rivalNome || !!data.rivalLogo);
                setCasaNome(data.casaNome || '');
                setCasaLogo(data.casaLogo || '');
                setUseCasaInfo(!!data.casaLogo || (!!data.casaNome && data.casaNome !== 'UBA FC'));
                setShowNumbers(data.showNumbers !== false); // Default to true

                // Converte Unix para formato de input datetime-local
                if (data.dataUnix) {
                    const date = new Date(data.dataUnix);
                    const localISO = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                    setDataJogo(localISO);
                }
                setUseDataJogo(data.showDataJogo !== false);
            } else {
                showAlert('Convocação não encontrada.', 'error');
                navigate('/admin/jogos/convocacao');
            }
        } catch (error) {
            console.error('Error fetching details:', error);
            showAlert('Erro ao buscar detalhes.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const resizeImage = (base64Str: string, maxWidth = 400, maxHeight = 400): Promise<string> => {
        return new Promise((resolve) => {
            let img = new Image();
            img.src = base64Str;
            img.onload = () => {
                let canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                let ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        });
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            const compressed = await resizeImage(base64);
            setRivalLogo(compressed);
        };
        reader.readAsDataURL(file);
    };

    const handleCasaLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            const compressed = await resizeImage(base64);
            setCasaLogo(compressed);
        };
        reader.readAsDataURL(file);
    };

    const getStudentByJogador = (jogador: ConvocacaoJogador) => {
        return allStudents.find(student =>
            student.uniqueId === jogador.id ||
            student.uniqueId === `${jogador.regId || ''}_${jogador.id.split('_')[1] || ''}` ||
            student.regId === jogador.regId ||
            student.regId === jogador.id
        );
    };

    const normalizePhone = (phone?: string) => {
        const digits = (phone || '').replace(/\D/g, '');
        if (!digits) return '';
        if (digits.startsWith('55')) return digits;
        return `55${digits}`;
    };

    const buildConvocacaoMessage = (jogador: ConvocacaoJogador, responsavel: string) => {
        const categoria = jogador.categoria === 'titular' ? 'titular' : 'reserva';
        const dateText = useDataJogo ? formatConvocacaoDate(dataJogo) : 'Data a confirmar';
        const numberText = showNumbers && jogador.numero ? `\nCamisa: *${String(jogador.numero).trim()}*` : '';
        const opponentText = rivalNome.trim() ? `\nAdversário: *${rivalNome.trim()}*` : '';
        const coachText = tecnico.trim() ? `\nTécnico: ${tecnico.trim()}` : '';

        return `Olá, ${(responsavel || 'responsável').trim()}! Tudo bem?

Passando para avisar que o(a) aluno(a) *${jogador.nome.trim()}* foi convocado(a) para:

*${(jogoNome || 'Convocação UBA 2026').trim()}*
Data: *${dateText}*
Categoria: *${categoria.toUpperCase()}*${numberText}${opponentText}${coachText}

Por favor, confirme o recebimento e a presença pelo WhatsApp.

UBA Clube Manhuaçu`;
    };

    const convocacaoRecipients = useMemo<ConvocacaoWhatsAppRecipient[]>(() => {
        return jogadores.map(jogador => {
            const student = getStudentByJogador(jogador);
            const rawPhone = student?.responsavel?.telefonePrincipal || student?.responsavel?.celular || student?.responsavel?.telefone || '';
            const phone = normalizePhone(rawPhone);
            const responsavel = student?.responsavel?.nome || jogador.responsavel || 'responsável';

            return {
                id: jogador.id,
                jogador,
                responsavel,
                phone,
                formattedPhone: rawPhone || 'Sem telefone',
                message: buildConvocacaoMessage(jogador, responsavel)
            };
        });
    }, [jogadores, allStudents, jogoNome, dataJogo, useDataJogo, showNumbers, rivalNome, tecnico]);

    const validWhatsAppRecipients = useMemo(
        () => convocacaoRecipients.filter(item => item.phone.length >= 12),
        [convocacaoRecipients]
    );

    useEffect(() => {
        if (!whatsAppTestModelId && convocacaoRecipients.length > 0) {
            setWhatsAppTestModelId(convocacaoRecipients[0].id);
        }
    }, [convocacaoRecipients, whatsAppTestModelId]);

    const selectedWhatsAppTestModel = useMemo(() => {
        return convocacaoRecipients.find(item => item.id === whatsAppTestModelId) || convocacaoRecipients[0] || null;
    }, [convocacaoRecipients, whatsAppTestModelId]);

    const loadWhatsAppPanel = async () => {
        setWhatsAppStatus('CHECKING');
        setWhatsAppPanelError('');
        const config = await loadConvocacaoWhatsAppConfig();
        setWhatsAppConfig(config);

        if (!config?.apiKey) {
            setWhatsAppStatus('DISCONNECTED');
            setWhatsAppQrCode(null);
            setWhatsAppPanelError('API key do WhatsApp não encontrada. Abra Mensagens > Configurações e salve as credenciais.');
            return;
        }

        await checkWhatsAppStatus(config.apiKey);
    };

    const loadConvocacaoWhatsAppConfig = async (): Promise<WhatsAppFullConfig | null> => {
        try {
            const snap = await getDoc(doc(db, 'system_settings', 'whatsapp'));
            const envKey = (import.meta.env.VITE_WHATSAPP_API_KEY as string) || '';
            if (snap.exists()) {
                const data = snap.data();
                return {
                    apiKey: resolveWhatsAppApiKey(data.apiKey || envKey),
                    senderPhone: data.senderPhone || '',
                    testPhone: data.testPhone || '',
                    modoTeste: data.modoTeste === true,
                    imageUrl: data.imageUrl || '',
                    pendingImageUrl: data.pendingImageUrl || ''
                };
            }

            return envKey ? {
                apiKey: resolveWhatsAppApiKey(envKey),
                senderPhone: '',
                testPhone: '',
                modoTeste: false,
                imageUrl: '',
                pendingImageUrl: ''
            } : null;
        } catch (error) {
            console.error('Erro ao carregar configuração do WhatsApp:', error);
            return null;
        }
    };

    const checkWhatsAppStatus = async (key = whatsAppConfig?.apiKey || '', showChecking = true) => {
        if (!key) {
            setWhatsAppStatus('DISCONNECTED');
            setWhatsAppQrCode(null);
            setWhatsAppPanelError('API key do WhatsApp não encontrada.');
            return;
        }

        setWhatsAppPanelError('');
        if (showChecking) setWhatsAppStatus('CHECKING');
        try {
            const res = await fetch(`${WHATSAPP_SERVICE_URL}/instance/connectionState/${INSTANCE_NAME}`, {
                headers: { 'apikey': key }
            });

            if (res.status === 401 || res.status === 403) {
                setWhatsAppStatus('DISCONNECTED');
                setWhatsAppQrCode(null);
                setWhatsAppPanelError('API key inválida ou não autorizada para buscar o QR Code.');
                return;
            }

            if (res.status === 404) {
                const created = await ensureInstance(key);
                setWhatsAppStatus('DISCONNECTED');
                if (created) await fetchWhatsAppQrCode(key);
                return;
            }

            if (!res.ok) {
                setWhatsAppStatus('DISCONNECTED');
                await fetchWhatsAppQrCode(key);
                return;
            }

            const json = await res.json();
            if (json.instance?.state === 'open') {
                setWhatsAppStatus('CONNECTED');
                setWhatsAppQrCode(null);
                setWhatsAppQrUpdatedAt(null);
            } else {
                setWhatsAppStatus('DISCONNECTED');
                await fetchWhatsAppQrCode(key);
            }
        } catch (error) {
            console.error('Erro ao verificar WhatsApp:', error);
            setWhatsAppStatus('DISCONNECTED');
        }
    };

    const fetchWhatsAppQrCode = async (key = whatsAppConfig?.apiKey || '', silent = false) => {
        if (!key) return;
        try {
            setWhatsAppQrRefreshing(true);
            if (!silent) setWhatsAppQrCode(null);
            const res = await fetch(`${WHATSAPP_SERVICE_URL}/instance/connect/${INSTANCE_NAME}`, {
                headers: { 'apikey': key }
            });
            if (!res.ok) {
                const text = await res.text();
                setWhatsAppPanelError(`Não foi possível carregar o QR Code (HTTP ${res.status}). ${text.substring(0, 120)}`);
                setWhatsAppQrCode(null);
                return;
            }
            const json = await res.json();
            const rawQr = json.base64 || json.qrcode?.base64 || json.qrcode || json.qr || json.code;
            const normalizedQr = normalizeQrCode(rawQr);
            setWhatsAppQrCode(normalizedQr);
            if (normalizedQr) {
                setWhatsAppQrUpdatedAt(new Date());
                setWhatsAppPanelError('');
            }
            if (!rawQr) setWhatsAppPanelError('A API respondeu, mas não enviou o QR Code.');
        } catch (error) {
            console.error('Erro ao buscar QR Code:', error);
            setWhatsAppPanelError('Erro de conexão ao buscar o QR Code.');
            setWhatsAppQrCode(null);
        } finally {
            setWhatsAppQrRefreshing(false);
        }
    };

    const openWhatsAppPanel = async () => {
        setIsWhatsAppPanelOpen(true);
        setManualSentIds(new Set());
        setWhatsAppSendLogs(validWhatsAppRecipients.map(item => ({
            id: item.id,
            name: item.jogador.nome,
            phone: item.formattedPhone,
            status: 'pending',
            log: 'Aguardando confirmação'
        })));
        if (whatsAppSendMode === 'auto') {
            await loadWhatsAppPanel();
        }
    };

    const openManualWhatsApp = (item: ConvocacaoWhatsAppRecipient) => {
        if (item.phone.length < 12) return;
        const url = `https://wa.me/${item.phone}?text=${encodeURIComponent(item.message)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        setManualSentIds(prev => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
        });
    };

    const openManualWhatsAppTest = () => {
        if (!whatsAppTestPhone.trim()) {
            showAlert('Informe um número para receber o teste.', 'warning');
            return;
        }
        if (!selectedWhatsAppTestModel) {
            showAlert('Escolha um aluno para usar como modelo.', 'warning');
            return;
        }
        const phone = normalizePhone(whatsAppTestPhone);
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(selectedWhatsAppTestModel.message)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        setWhatsAppTestStatus('success');
        setWhatsAppTestLog('WhatsApp aberto com a mensagem de teste. Confira e envie por lá.');
    };

    const sendConvocacaoWhatsApp = () => {
        if (!whatsAppConfig) {
            showAlert('Configuração do WhatsApp não encontrada. Configure em Mensagens > Configurações.', 'error');
            return;
        }

        if (whatsAppStatus !== 'CONNECTED') {
            showAlert('Conecte ou confirme o número do WhatsApp antes de enviar.', 'warning');
            return;
        }

        if (validWhatsAppRecipients.length === 0) {
            showAlert('Nenhum convocado com telefone válido foi encontrado.', 'warning');
            return;
        }

        showConfirm(
            `Enviar aviso da convocação para ${validWhatsAppRecipients.length} contato(s)? O sistema aguardará 8 segundos entre cada mensagem.`,
            async () => {
                setWhatsAppSending(true);
                setWhatsAppProgress({ current: 0, total: validWhatsAppRecipients.length });
                setWhatsAppSendLogs(validWhatsAppRecipients.map(item => ({
                    id: item.id,
                    name: item.jogador.nome,
                    phone: item.formattedPhone,
                    status: 'pending',
                    log: 'Na fila desta convocação'
                })));

                let successCount = 0;
                for (let index = 0; index < validWhatsAppRecipients.length; index++) {
                    const item = validWhatsAppRecipients[index];
                    setWhatsAppProgress({ current: index + 1, total: validWhatsAppRecipients.length });
                    setWhatsAppSendLogs(prev => prev.map(log => log.id === item.id ? { ...log, status: 'sending', log: 'Enviando agora...' } : log));

                    const result = await sendWhatsApp(
                        item.phone,
                        item.message,
                        { ...whatsAppConfig, modoTeste: false },
                        false,
                        '',
                        undefined,
                        item.jogador.nome,
                        item.jogador.photo
                    );

                    if (result.success) successCount++;
                    setWhatsAppSendLogs(prev => prev.map(log => log.id === item.id ? {
                        ...log,
                        status: result.success ? 'success' : 'error',
                        log: result.log || (result.success ? 'Enviado' : 'Erro no envio')
                    } : log));

                    if (index < validWhatsAppRecipients.length - 1) {
                        await wait(8000);
                    }
                }

                setWhatsAppSending(false);
                showAlert(`${successCount} de ${validWhatsAppRecipients.length} aviso(s) enviados.`, successCount === validWhatsAppRecipients.length ? 'success' : 'warning');
            },
            'warning',
            'Confirmar envio via WhatsApp'
        );
    };

    const sendConvocacaoWhatsAppTest = async () => {
        if (!whatsAppConfig) {
            showAlert('Configuração do WhatsApp não carregada.', 'error');
            return;
        }

        if (whatsAppStatus !== 'CONNECTED') {
            showAlert('Conecte ou confirme o WhatsApp antes de testar.', 'warning');
            return;
        }

        if (!whatsAppTestPhone.trim()) {
            showAlert('Informe um número para receber o teste.', 'warning');
            return;
        }

        if (!selectedWhatsAppTestModel) {
            showAlert('Escolha um aluno para usar como modelo.', 'warning');
            return;
        }

        setWhatsAppTestStatus('sending');
        setWhatsAppTestLog('');

        const result = await sendWhatsApp(
            whatsAppTestPhone,
            selectedWhatsAppTestModel.message,
            {
                ...whatsAppConfig,
                testPhone: normalizePhone(whatsAppTestPhone),
                modoTeste: true,
                imageUrl: ''
            },
            true,
            '',
            undefined,
            selectedWhatsAppTestModel.jogador.nome,
            selectedWhatsAppTestModel.jogador.photo
        );

        setWhatsAppTestStatus(result.success ? 'success' : 'error');
        setWhatsAppTestLog(result.log || (result.success ? 'Teste enviado com sucesso.' : 'Erro ao enviar teste.'));
    };

    const handleSave = async () => {
        if (!convocacao) return;
        try {
            setLoading(true, 'Salvando alterações...');
            const docRef = doc(db, 'uba_2026_convocacoes', convocacao.id as string);
            const updatedData = {
                ...convocacao,
                jogo: jogoNome,
                jogadores,
                tecnico: useTecnico ? tecnico.trim() : '',
                rivalNome: useRivalInfo ? rivalNome.trim() : '',
                rivalLogo: useRivalInfo ? (rivalLogo || '') : '',
                casaNome: useCasaInfo ? casaNome.trim() : 'UBA FC',
                casaLogo: useCasaInfo ? (casaLogo || '') : '',
                showNumbers,
                showDataJogo: useDataJogo,
                dataUnix: useDataJogo && dataJogo ? new Date(dataJogo).getTime() : Date.now()
            };

            await updateDoc(docRef, updatedData);
            setConvocacao(updatedData as Convocacao);

            showAlert('Convocação atualizada com sucesso!', 'success');
        } catch (error) {
            console.error('Error updating:', error);
            showAlert('Erro ao atualizar convocação.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = () => {
        if (!id) return;

        showConfirm(
            'Tem certeza que deseja excluir esta convocação permanentemente?',
            async () => {
                try {
                    setLoading(true, 'Excluindo...');
                    const docRef = doc(db, 'uba_2026_convocacoes', id);
                    await deleteDoc(docRef);
                    showAlert('Convocação excluída com sucesso!', 'success');
                    navigate('/admin/jogos/convocacao');
                } catch (error) {
                    console.error('Error deleting:', error);
                    showAlert('Erro ao excluir convocação.', 'error');
                } finally {
                    setLoading(false);
                }
            },
            'warning',
            'Confirmar Exclusão'
        );
    };



    const handleDragEnd = (event: DragEndEvent, categoria: 'titular' | 'reserva') => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setJogadores((items) => {
                const oldIndex = items.findIndex(i => i.id === active.id);
                const newIndex = items.findIndex(i => i.id === over.id);

                // Only act if both are in the same category (they should be, given we filter)
                if (items[oldIndex]?.categoria === categoria && items[newIndex]?.categoria === categoria) {
                    return arrayMove(items, oldIndex, newIndex);
                }
                return items;
            });
        }
    };

    const handleRemovePlayer = (playerId: string) => {
        setJogadores(prev => prev.filter(j => j.id !== playerId));
    };

    const handleSwapCategory = (playerId: string) => {
        setJogadores(prev => prev.map(j => {
            if (j.id === playerId) {
                return { ...j, categoria: j.categoria === 'titular' ? 'reserva' : 'titular' };
            }
            return j;
        }));
    };

    const handleAddPlayer = (studentRaw: any, categoria: 'titular' | 'reserva') => {
        if (!studentRaw.aluno) return;

        if (jogadores.some(j => j.id === studentRaw.uniqueId)) {
            showAlert('Este aluno já está na convocação.', 'warning');
            return;
        }

        const turmaName = turmas.find(t => t.id === studentRaw.aluno.turmaId)?.nome || 'Sem Turma';

        const jogador: ConvocacaoJogador = {
            id: studentRaw.uniqueId,
            regId: studentRaw.regId,
            nome: studentRaw.aluno.nome,
            photo: studentRaw.aluno.fotoUrl || '',
            turma: turmaName,
            categoria,
            numero: studentRaw.aluno.camisa || '', // Auto-fill with jersey number
            responsavel: studentRaw.responsavel?.nome || ''
        };

        setJogadores(prev => [...prev, jogador]);
        showAlert(`${jogador.nome} adicionado!`, 'success');
    };



    const titulares = jogadores.filter(j => j.categoria === 'titular');
    const reservas = jogadores.filter(j => j.categoria === 'reserva');

    const filteredStudents = useMemo(() => {
        if (!searchTerm || searchTerm.length < 2) return [];
        const lowerSearch = searchTerm.toLowerCase();

        // Detectar se a busca contém anos (4 dígitos)
        const yearMatches = searchTerm.match(/\b(20\d{2})\b/g);

        if (yearMatches && yearMatches.length > 0) {
            // Se houver anos na busca, filtrar por eles
            return allStudents.filter(s =>
                s.aluno &&
                s.aluno.dataNascimento &&
                s.modalidade === searchModalidade &&
                yearMatches.includes(s.aluno.dataNascimento.includes('/') ? (s.aluno.dataNascimento.split('/').pop() || '') : s.aluno.dataNascimento.split('-')[0]) &&
                s.contractStatus !== 'desativado' &&
                !jogadores.some(j => j.id === s.uniqueId)
            ).sort((a, b) => {
                // Ordenação por nascimento (do mais velho para o mais novo)
                const dateA = a.aluno?.dataNascimento || '9999-99-99';
                const dateB = b.aluno?.dataNascimento || '9999-99-99';
                return dateA.localeCompare(dateB);
            }).slice(0, 20); // Aumentado limite para buscas por ano
        }

        // Caso contrário, busca por nome normal
        return allStudents.filter(s =>
            s.aluno &&
            s.modalidade === searchModalidade &&
            s.aluno.nome.toLowerCase().includes(lowerSearch) &&
            s.contractStatus !== 'desativado' &&
            !jogadores.some(j => j.id === s.uniqueId)
        ).slice(0, 8);
    }, [searchTerm, allStudents, jogadores, searchModalidade]);

    // Convocação "ao vivo" com o estado atual dos campos (inclusive antes de salvar), usada só para gerar a prévia da imagem
    const liveConvocacao = useMemo<Convocacao | null>(() => {
        if (!convocacao) return null;
        return {
            ...convocacao,
            jogo: jogoNome,
            jogadores,
            tecnico: useTecnico ? tecnico.trim() : '',
            rivalNome: useRivalInfo ? rivalNome.trim() : '',
            rivalLogo: useRivalInfo ? (rivalLogo || '') : '',
            casaNome: useCasaInfo ? casaNome.trim() : 'UBA FC',
            casaLogo: useCasaInfo ? (casaLogo || '') : '',
            showNumbers,
            showDataJogo: useDataJogo,
            dataUnix: useDataJogo && dataJogo ? new Date(dataJogo).getTime() : (convocacao.dataUnix || Date.now())
        };
    }, [convocacao, jogoNome, jogadores, tecnico, useTecnico, rivalNome, rivalLogo, useRivalInfo, casaNome, casaLogo, useCasaInfo, showNumbers, useDataJogo, dataJogo]);

    useEffect(() => {
        if (!liveConvocacao) return;
        let cancelled = false;
        setPreviewLoading(true);

        const timer = window.setTimeout(async () => {
            try {
                const url = await generateImage(liveConvocacao, 'geral');
                if (!cancelled) setPreviewImageUrl(url);
            } catch (error) {
                console.error('Erro ao gerar prévia da convocação:', error);
            } finally {
                if (!cancelled) setPreviewLoading(false);
            }
        }, 400);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [liveConvocacao, generateImage]);

    const handleDownloadImage = async () => {
        if (!liveConvocacao) return;
        setIsDownloadingImage(true);
        try {
            const success = await downloadImage(liveConvocacao, 'geral');
            if (success) showAlert('Imagem baixada com sucesso!', 'success');
            else showAlert('Erro ao gerar a imagem.', 'error');
        } finally {
            setIsDownloadingImage(false);
        }
    };

    if (!convocacao) return null;

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <header style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'stretch' : 'center',
                marginBottom: '30px',
                background: '#fff',
                padding: '15px 25px',
                borderRadius: '12px',
                border: '1px solid #eee',
                gap: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button onClick={() => navigate(`${pathPrefix}/jogos/convocacao`)} style={{ background: '#f5f5f5', border: 'none', padding: '10px', borderRadius: '50%', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                        <ArrowLeft size={20} color="#666" />
                    </button>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Trophy size={isMobile ? 20 : 24} color="#c32228" />
                            <input
                                type="text"
                                value={jogoNome}
                                onChange={e => setJogoNome(e.target.value)}
                                placeholder="Nome do Jogo"
                                style={{ fontSize: isMobile ? '1.2rem' : '1.5rem', border: 'none', borderBottom: '2px solid #eee', color: '#c32228', fontWeight: '800', outline: 'none', padding: '0 5px 2px 5px', width: '100%', maxWidth: '400px', background: 'transparent' }}
                            />
                        </div>
                        <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label style={{ position: 'relative', display: 'inline-block', width: '30px', height: '16px', cursor: 'pointer', flexShrink: 0 }}>
                                <input
                                    type="checkbox"
                                    checked={useDataJogo}
                                    onChange={e => {
                                        setUseDataJogo(e.target.checked);
                                        if (!e.target.checked) setDataJogo(new Date().toISOString().slice(0, 16));
                                    }}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: useDataJogo ? '#c32228' : '#ccc', borderRadius: '34px', transition: '.4s' }}></span>
                                <span style={{ position: 'absolute', height: '12px', width: '12px', left: useDataJogo ? '15px' : '2px', bottom: '2px', backgroundColor: 'white', borderRadius: '50%', transition: '.4s' }}></span>
                            </label>
                            {useDataJogo ? (
                                <input
                                    type="datetime-local"
                                    value={dataJogo}
                                    onChange={e => setDataJogo(e.target.value)}
                                    style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem', outline: 'none', color: '#666', width: isMobile ? '100%' : 'auto' }}
                                />
                            ) : (
                                <span style={{ fontSize: '0.85rem', color: '#999', fontWeight: 'bold' }}>DATA OCULTA</span>
                            )}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexDirection: isMobile ? 'column' : 'row' }}>
                    <button
                        onClick={openWhatsAppPanel}
                        style={{ flex: 1, background: '#25D366', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: isMobile ? '0.85rem' : '1rem', boxShadow: '0 4px 10px rgba(37,211,102,0.25)' }}
                    >
                        <MessageCircle size={18} /> AVISAR
                    </button>
                    <button
                        onClick={handleSave}
                        style={{ flex: 1, background: '#c32228', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(195,34,40,0.3)', fontSize: isMobile ? '0.85rem' : '1rem' }}
                    >
                        <Save size={18} /> SALVAR
                    </button>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '380px minmax(0, 1fr)', gap: '25px', alignItems: 'start' }}>

                {/* PRÉVIA DA IMAGEM */}
                <div style={{
                    background: '#fff',
                    border: '1px solid #eee',
                    borderRadius: '16px',
                    padding: isMobile ? '16px' : '20px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
                    ...(isMobile ? {} : { position: 'sticky' as const, top: '20px' })
                }}>
                    <h2 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 900, color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ImageIcon size={20} color="#c32228" /> Prévia da Arte
                    </h2>

                    <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee', background: '#f5f5f5', minHeight: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        {previewImageUrl ? (
                            <img src={previewImageUrl} alt="Prévia da convocação" style={{ width: '100%', display: 'block' }} />
                        ) : (
                            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                {previewLoading ? 'Gerando prévia...' : 'Prévia indisponível'}
                            </div>
                        )}
                        {previewImageUrl && previewLoading && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#c32228', fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                                ATUALIZANDO...
                            </div>
                        )}
                    </div>

                    {/* Toggle números das camisas */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '16px', padding: '12px 14px', borderRadius: '10px', background: showNumbers ? '#fff9f9' : '#f5f5f5', border: showNumbers ? '1px solid #ffdada' : '1px solid #ddd', transition: 'all 0.3s ease' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: showNumbers ? '#c32228' : '#666' }}>
                            NÚMEROS DAS CAMISAS
                        </span>
                        <label style={{ position: 'relative', display: 'inline-block', width: '38px', height: '20px', cursor: 'pointer', flexShrink: 0 }}>
                            <input
                                type="checkbox"
                                checked={showNumbers}
                                onChange={e => setShowNumbers(e.target.checked)}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: showNumbers ? '#c32228' : '#ccc', borderRadius: '34px', transition: '.4s' }}></span>
                            <span style={{ position: 'absolute', height: '14px', width: '14px', left: showNumbers ? '21px' : '3px', bottom: '3px', backgroundColor: 'white', borderRadius: '50%', transition: '.4s' }}></span>
                        </label>
                    </div>

                    <button
                        onClick={handleDownloadImage}
                        disabled={!previewImageUrl || isDownloadingImage}
                        style={{
                            width: '100%',
                            marginTop: '16px',
                            background: (!previewImageUrl || isDownloadingImage) ? '#ccc' : '#c32228',
                            color: '#fff',
                            border: 'none',
                            padding: '14px',
                            borderRadius: '10px',
                            fontWeight: 900,
                            fontSize: '1rem',
                            cursor: (!previewImageUrl || isDownloadingImage) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(195,34,40,0.25)'
                        }}
                    >
                        <Download size={18} /> {isDownloadingImage ? 'BAIXANDO...' : 'BAIXAR IMAGEM'}
                    </button>

                    <button
                        onClick={() => setIsImageModalOpen(true)}
                        style={{ width: '100%', marginTop: '10px', background: 'none', border: 'none', color: '#888', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: '6px' }}
                    >
                        Gerar arte individual (com foto do aluno)
                    </button>
                </div>

                {/* CONTEÚDO PRINCIPAL (edição) */}
                <div>

            {/* Info Cards - Técnico */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                <div style={{ background: useTecnico ? '#fff' : '#f5f5f5', padding: '20px', borderRadius: '12px', border: useTecnico ? '1px solid #eee' : '1px solid #ddd', boxShadow: useTecnico ? '0 2px 8px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.3s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: useTecnico ? '15px' : '0' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#666' }}>TÉCNICO (Opcional)</label>
                        <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={useTecnico}
                                onChange={e => {
                                    setUseTecnico(e.target.checked);
                                    if (!e.target.checked) setTecnico('');
                                }}
                                style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: useTecnico ? '#c32228' : '#ccc', borderRadius: '34px', transition: '.4s' }}></span>
                            <span style={{ position: 'absolute', height: '14px', width: '14px', left: useTecnico ? '23px' : '3px', bottom: '3px', backgroundColor: 'white', borderRadius: '50%', transition: '.4s' }}></span>
                        </label>
                    </div>
                    {useTecnico && (
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                value={tecnico}
                                onChange={e => setTecnico(e.target.value)}
                                placeholder="Nome do Técnico"
                                style={{ width: '100%', padding: '10px', paddingRight: '35px', border: '1px solid #ddd', borderRadius: '8px', outline: 'none' }}
                            />
                            {tecnico && (
                                <button
                                    onClick={() => setTecnico('')}
                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#999', cursor: 'pointer', display: 'flex' }}
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Casa Options */}
            <div style={{ background: useCasaInfo ? '#fff1f0' : '#f5f5f5', padding: '20px', borderRadius: '12px', border: useCasaInfo ? '1px solid #ffccc7' : '1px solid #ddd', marginBottom: '20px', boxShadow: useCasaInfo ? '0 2px 8px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.3s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: useCasaInfo ? '15px' : '0' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: '800', color: useCasaInfo ? '#c32228' : '#666' }}>INFORMAÇÕES DO TIME DA CASA (Opcional)</label>
                    <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={useCasaInfo}
                            onChange={e => {
                                setUseCasaInfo(e.target.checked);
                                if (!e.target.checked) {
                                    setCasaNome('UBA FC');
                                    setCasaLogo('');
                                }
                            }}
                            style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: useCasaInfo ? '#c32228' : '#ccc', borderRadius: '34px', transition: '.4s' }}></span>
                        <span style={{ position: 'absolute', height: '14px', width: '14px', left: useCasaInfo ? '23px' : '3px', bottom: '3px', backgroundColor: 'white', borderRadius: '50%', transition: '.4s' }}></span>
                    </label>
                </div>

                {useCasaInfo && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#c32228', marginBottom: '8px' }}>NOME DO TIME DA CASA</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    value={casaNome}
                                    onChange={e => setCasaNome(e.target.value)}
                                    placeholder="Ex: UBA FC"
                                    style={{ width: '100%', padding: '10px', paddingRight: '35px', border: '1px solid #ffccc7', borderRadius: '8px', outline: 'none' }}
                                />
                                {casaNome && (
                                    <button
                                        onClick={() => setCasaNome('')}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#ff7875', cursor: 'pointer', display: 'flex' }}
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#c32228', marginBottom: '8px' }}>LOGO DA CASA</label>
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleCasaLogoUpload}
                                    style={{ flex: 1, fontSize: '0.85rem' }}
                                />
                                {casaLogo && (
                                    <div style={{ position: 'relative' }}>
                                        <img src={casaLogo} alt="Preview" style={{ width: '50px', height: '50px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #eee' }} />
                                        <button
                                            onClick={() => setCasaLogo('')}
                                            style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: '50%', padding: '2px', cursor: 'pointer', display: 'flex' }}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Rival Options */}
            <div style={{ background: useRivalInfo ? '#fff' : '#f5f5f5', padding: '20px', borderRadius: '12px', border: useRivalInfo ? '1px solid #eee' : '1px solid #ddd', marginBottom: '30px', boxShadow: useRivalInfo ? '0 2px 8px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.3s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: useRivalInfo ? '15px' : '0' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: '800', color: '#666' }}>INFORMAÇÕES DO TIME RIVAL (Opcional)</label>
                    <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={useRivalInfo}
                            onChange={e => {
                                setUseRivalInfo(e.target.checked);
                                if (!e.target.checked) {
                                    setRivalNome('');
                                    setRivalLogo('');
                                }
                            }}
                            style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: useRivalInfo ? '#c32228' : '#ccc', borderRadius: '34px', transition: '.4s' }}></span>
                        <span style={{ position: 'absolute', height: '14px', width: '14px', left: useRivalInfo ? '23px' : '3px', bottom: '3px', backgroundColor: 'white', borderRadius: '50%', transition: '.4s' }}></span>
                    </label>
                </div>

                {useRivalInfo && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#666', marginBottom: '8px' }}>NOME DO TIME RIVAL</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    value={rivalNome}
                                    onChange={e => setRivalNome(e.target.value)}
                                    placeholder="Ex: Aliança FC"
                                    style={{ width: '100%', padding: '10px', paddingRight: '35px', border: '1px solid #ddd', borderRadius: '8px', outline: 'none' }}
                                />
                                {rivalNome && (
                                    <button
                                        onClick={() => setRivalNome('')}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#999', cursor: 'pointer', display: 'flex' }}
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#666', marginBottom: '8px' }}>LOGO DO RIVAL</label>
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    style={{ flex: 1, fontSize: '0.85rem' }}
                                />
                                {rivalLogo && (
                                    <div style={{ position: 'relative' }}>
                                        <img src={rivalLogo} alt="Preview" style={{ width: '50px', height: '50px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #eee' }} />
                                        <button
                                            onClick={() => setRivalLogo('')}
                                            style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ff4d4f', color: '#fff', border: 'none', borderRadius: '50%', padding: '2px', cursor: 'pointer', display: 'flex' }}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Ações Auxiliares - Add Jogador Full Width */}
            <div style={{ marginBottom: '25px' }}>
                <button
                    onClick={() => setIsModalOpen(true)}
                    style={{
                        width: '100%',
                        background: '#fff',
                        color: '#c32228',
                        border: '2px solid #c32228',
                        padding: '15px',
                        borderRadius: '12px',
                        fontWeight: '900',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        fontSize: '1.1rem',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 4px 12px rgba(195,34,40,0.1)'
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = '#fff5f5'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                    <Plus size={22} strokeWidth={3} /> ADICIONAR JOGADOR À CONVOCAÇÃO
                </button>
            </div>

            {/* Content */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: '25px', alignItems: 'start' }}>

                {/* Titulares */}
                <div style={{ background: '#fdfdfd', border: '1px solid #eee', borderRadius: '12px', padding: '20px' }}>
                    <h2 style={{ fontSize: '1.2rem', color: '#333', fontWeight: '800', margin: '0 0 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        TITULARES <span style={{ background: '#e6f7ff', color: '#0050b3', padding: '4px 12px', borderRadius: '12px', fontSize: '0.9rem' }}>{titulares.length}</span>
                    </h2>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'titular')}>
                        <SortableContext items={titulares.map(t => t.id)} strategy={verticalListSortingStrategy}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {titulares.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#999', background: '#fff', borderRadius: '8px', border: '1px dashed #ddd' }}>Nenhum titular.</div>}
                                {titulares.map(t => (
                                    <SortableJogadorItem key={t.id} id={t.id} jogador={t} showNumbers={showNumbers} onRemove={handleRemovePlayer} onSwap={handleSwapCategory} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>

                {/* Reservas */}
                <div style={{ background: '#fdfdfd', border: '1px solid #eee', borderRadius: '12px', padding: '20px' }}>
                    <h2 style={{ fontSize: '1.2rem', color: '#333', fontWeight: '800', margin: '0 0 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        RESERVAS <span style={{ background: '#f6ffed', color: '#389e0d', padding: '4px 12px', borderRadius: '12px', fontSize: '0.9rem' }}>{reservas.length}</span>
                    </h2>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'reserva')}>
                        <SortableContext items={reservas.map(r => r.id)} strategy={verticalListSortingStrategy}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {reservas.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: '#999', background: '#fff', borderRadius: '8px', border: '1px dashed #ddd' }}>Nenhum reserva.</div>}
                                {reservas.map(r => (
                                    <SortableJogadorItem key={r.id} id={r.id} jogador={r} showNumbers={showNumbers} onRemove={handleRemovePlayer} onSwap={handleSwapCategory} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            </div>

                </div>
                {/* Fim conteúdo principal */}
            </div>
            {/* Fim grid prévia + conteúdo */}

            {/* Add Player Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(3px)' }}>
                    <div style={{ background: '#fff', width: '100%', maxWidth: '600px', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                        <div style={{ padding: isMobile ? '15px 20px' : '20px 25px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fdfdfd' }}>
                            <h2 style={{ margin: 0, color: '#333', fontSize: isMobile ? '1rem' : '1.2rem', fontWeight: '800' }}>Adicionar Jogador</h2>
                            <button onClick={() => { setIsModalOpen(false); setSearchTerm(''); setSearchModalidade('futebol'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}>
                                <X size={isMobile ? 20 : 24} />
                            </button>
                        </div>

                        <div style={{ padding: isMobile ? '15px' : '25px', background: '#fcfcfc' }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '0 15px', gap: '10px' }}>
                                    <Search size={20} color="#999" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        placeholder="Nome ou Ano (ex: 2017, 2018)..."
                                        style={{ width: '100%', padding: '12px 0', border: 'none', fontSize: '1rem', outline: 'none', background: 'transparent' }}
                                        autoFocus
                                    />
                                </div>
                                <select
                                    value={searchModalidade}
                                    onChange={e => setSearchModalidade(e.target.value)}
                                    style={{ width: isMobile ? '120px' : '180px', padding: '12px 10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.85rem', outline: 'none', background: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    {activeModalidades.map(m => (
                                        <option key={m.id} value={m.id}>{m.icon} {m.label.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginTop: '15px', maxHeight: '350px', overflowY: 'auto' }}>
                                {studentsLoading && <div style={{ padding: '15px', textAlign: 'center', color: '#999' }}>Carregando base de alunos...</div>}
                                {!studentsLoading && searchTerm.length >= 2 && filteredStudents.length === 0 && <div style={{ padding: '15px', textAlign: 'center', color: '#999' }}>Nenhum aluno encontrado (ou todos já foram adicionados).</div>}

                                {filteredStudents.map(student => (
                                    <div key={student.uniqueId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #eee', background: '#fff', borderRadius: '8px', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f5f5f5', overflow: 'hidden' }}>
                                                {student.aluno?.fotoUrl ? <img src={student.aluno.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Users size={20} color="#aaa" style={{ margin: '10px' }} />}
                                            </div>
                                            <div>
                                                <Link
                                                    to={`/admin/details/${student.regId}`}
                                                    style={{ fontWeight: '800', color: '#c32228', textDecoration: 'underline', textTransform: 'uppercase', fontSize: '0.95rem', display: 'block' }}
                                                >
                                                    {student.aluno?.nome}
                                                </Link>
                                                <div style={{ fontSize: '0.8rem', color: '#888' }}>{turmas.find(t => t.id === student.aluno?.turmaId)?.nome || 'Sem Turma'}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'flex-end', width: '110px' }}>
                                            <button
                                                onClick={() => handleAddPlayer(student, 'titular')}
                                                style={{ width: '100%', background: '#e6f7ff', color: '#0050b3', border: '1px solid #91d5ff', padding: '6px 5px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                                            >+ TITULAR</button>
                                            <button
                                                onClick={() => handleAddPlayer(student, 'reserva')}
                                                style={{ width: '100%', background: '#f6ffed', color: '#389e0d', border: '1px solid #b7eb8f', padding: '6px 5px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
                                            >+ RESERVA</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Botão de Excluir no Final */}
            <div style={{ marginTop: '50px', paddingTop: '30px', borderTop: '2px dashed #eee', display: 'flex', justifyContent: 'center' }}>
                <button
                    onClick={handleDelete}
                    style={{
                        background: '#fff',
                        color: '#ff4d4f',
                        border: '2px solid #ff4d4f',
                        padding: '12px 25px',
                        borderRadius: '10px',
                        fontWeight: '800',
                        fontSize: '1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'all 0.2s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = '#fff1f0'; e.currentTarget.style.transform = 'scale(1.05)'; }}
                    onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'scale(1)'; }}
                >
                    <Trash2 size={20} /> EXCLUIR ESTA CONVOCAÇÃO
                </button>
            </div>

            {isWhatsAppPanelOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#fff', width: '100%', maxWidth: '920px', maxHeight: '92vh', overflow: 'hidden', borderRadius: '22px', boxShadow: '0 28px 80px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: isMobile ? '18px' : '24px 28px', background: 'linear-gradient(135deg, #06351d 0%, #25D366 100%)', color: '#fff', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.16)', padding: '6px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 800, marginBottom: '10px' }}>
                                    <MessageCircle size={15} /> Aviso via WhatsApp
                                </div>
                                <h2 style={{ margin: 0, fontSize: isMobile ? '1.2rem' : '1.55rem', lineHeight: 1.2 }}>Enviar convocação para responsáveis</h2>
                                <p style={{ margin: '8px 0 0', opacity: 0.9, fontSize: '0.9rem' }}>
                                    {whatsAppSendMode === 'manual'
                                        ? 'Clique em "Enviar" em cada aluno para abrir o WhatsApp com a mensagem pronta.'
                                        : 'As mensagens serão enviadas uma por uma, com intervalo de 8 segundos.'}
                                </p>
                            </div>
                            <button
                                onClick={() => !whatsAppSending && setIsWhatsAppPanelOpen(false)}
                                disabled={whatsAppSending}
                                style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.26)', color: '#fff', width: '38px', height: '38px', borderRadius: '50%', cursor: whatsAppSending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: whatsAppSending ? 0.5 : 1 }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: isMobile ? '18px' : '24px 28px', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', background: '#f1f5f9', borderRadius: '14px', padding: '6px' }}>
                                <button
                                    onClick={() => setWhatsAppPanelTab('send')}
                                    style={{ flex: 1, border: 'none', borderRadius: '10px', padding: '11px 12px', fontWeight: 900, cursor: 'pointer', color: whatsAppPanelTab === 'send' ? '#064e3b' : '#64748b', background: whatsAppPanelTab === 'send' ? '#fff' : 'transparent', boxShadow: whatsAppPanelTab === 'send' ? '0 6px 18px rgba(15,23,42,0.08)' : 'none' }}
                                >
                                    Enviar avisos
                                </button>
                                <button
                                    onClick={() => setWhatsAppPanelTab('test')}
                                    style={{ flex: 1, border: 'none', borderRadius: '10px', padding: '11px 12px', fontWeight: 900, cursor: 'pointer', color: whatsAppPanelTab === 'test' ? '#064e3b' : '#64748b', background: whatsAppPanelTab === 'test' ? '#fff' : 'transparent', boxShadow: whatsAppPanelTab === 'test' ? '0 6px 18px rgba(15,23,42,0.08)' : 'none' }}
                                >
                                    Testar mensagem
                                </button>
                            </div>

                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', padding: '14px 16px', background: '#fff', marginBottom: '18px' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '10px' }}>Modo de envio</div>
                                <div style={{ display: 'flex', gap: '10px', flexDirection: isMobile ? 'column' : 'row' }}>
                                    <button
                                        onClick={() => setWhatsAppSendMode('manual')}
                                        style={{
                                            flex: 1,
                                            border: whatsAppSendMode === 'manual' ? '2px solid #25D366' : '1px solid #cbd5e1',
                                            background: whatsAppSendMode === 'manual' ? '#ecfdf5' : '#fff',
                                            color: whatsAppSendMode === 'manual' ? '#166534' : '#475569',
                                            borderRadius: '12px',
                                            padding: '11px 12px',
                                            fontWeight: 900,
                                            cursor: 'pointer',
                                            textAlign: 'left'
                                        }}
                                    >
                                        Envio manual (padrão)
                                        <div style={{ fontWeight: 600, fontSize: '0.78rem', marginTop: '3px', color: whatsAppSendMode === 'manual' ? '#15803d' : '#64748b' }}>
                                            Abre o WhatsApp com a mensagem pronta para cada aluno.
                                        </div>
                                    </button>
                                    <button
                                        disabled
                                        title="Envio automático desabilitado temporariamente"
                                        style={{
                                            flex: 1,
                                            border: '1px dashed #cbd5e1',
                                            background: '#f1f5f9',
                                            color: '#94a3b8',
                                            borderRadius: '12px',
                                            padding: '11px 12px',
                                            fontWeight: 900,
                                            cursor: 'not-allowed',
                                            textAlign: 'left'
                                        }}
                                    >
                                        Envio automático via API
                                        <div style={{ fontWeight: 600, fontSize: '0.78rem', marginTop: '3px' }}>
                                            Desabilitado temporariamente.
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (whatsAppSendMode === 'auto' ? 'minmax(0, 0.95fr) minmax(0, 1.05fr)' : '1fr'), gap: '18px', marginBottom: '18px' }}>
                                {whatsAppSendMode === 'auto' && (
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', background: '#f8fafc' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>Número remetente</div>
                                            <div style={{ marginTop: '4px', fontWeight: 900, color: '#0f172a' }}>
                                                {whatsAppConfig?.senderPhone || 'Número não informado nas configurações'}
                                            </div>
                                        </div>
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '7px',
                                            padding: '8px 10px',
                                            borderRadius: '999px',
                                            fontWeight: 900,
                                            fontSize: '0.78rem',
                                            color: whatsAppStatus === 'CONNECTED' ? '#166534' : whatsAppStatus === 'CHECKING' ? '#92400e' : '#991b1b',
                                            background: whatsAppStatus === 'CONNECTED' ? '#dcfce7' : whatsAppStatus === 'CHECKING' ? '#fef3c7' : '#fee2e2'
                                        }}>
                                            {whatsAppStatus === 'CONNECTED' ? <Wifi size={15} /> : <WifiOff size={15} />}
                                            {whatsAppStatus === 'CONNECTED' ? 'Conectado' : whatsAppStatus === 'CHECKING' ? 'Verificando' : 'Desconectado'}
                                        </div>
                                    </div>

                                    {whatsAppStatus === 'CONNECTED' ? (
                                        <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '14px', color: '#166534', fontSize: '0.9rem', fontWeight: 700 }}>
                                            Pode usar o número já conectado para enviar estes avisos.
                                        </div>
                                    ) : (
                                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '14px' }}>
                                            <p style={{ margin: '0 0 12px', color: '#475569', fontSize: '0.9rem', fontWeight: 700 }}>
                                                Conecte o aparelho que vai enviar as mensagens em WhatsApp &gt; Aparelhos conectados.
                                            </p>
                                            {whatsAppQrCode ? (
                                                <div style={{ textAlign: 'center' }}>
                                                    <img src={whatsAppQrCode} alt="QR Code do WhatsApp" style={{ width: '100%', maxWidth: '260px', display: 'block', margin: '0 auto', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                                                    <div style={{ marginTop: '10px', fontSize: '0.78rem', color: '#64748b', fontWeight: 800 }}>
                                                        {whatsAppQrRefreshing ? 'Renovando QR Code...' : `QR renovado ${whatsAppQrUpdatedAt ? whatsAppQrUpdatedAt.toLocaleTimeString('pt-BR') : 'agora'}. Atualiza sozinho a cada 15s.`}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ padding: '24px', textAlign: 'center', color: whatsAppPanelError ? '#b91c1c' : '#94a3b8', border: `1px dashed ${whatsAppPanelError ? '#fecaca' : '#cbd5e1'}`, background: whatsAppPanelError ? '#fff5f5' : '#fff', borderRadius: '12px', fontSize: '0.88rem', fontWeight: whatsAppPanelError ? 700 : 500 }}>
                                                    {whatsAppPanelError || (whatsAppStatus === 'CHECKING' ? 'Buscando QR Code automaticamente...' : 'QR Code ainda não carregado.')}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexDirection: isMobile ? 'column' : 'row' }}>
                                        <button
                                            onClick={() => fetchWhatsAppQrCode(whatsAppConfig?.apiKey || '')}
                                            disabled={whatsAppQrRefreshing || whatsAppStatus === 'CONNECTED' || !whatsAppConfig?.apiKey}
                                            style={{ flex: 1, border: '1px solid #bbf7d0', background: '#ecfdf5', color: '#166534', borderRadius: '12px', padding: '11px 12px', fontWeight: 800, cursor: (whatsAppQrRefreshing || whatsAppStatus === 'CONNECTED' || !whatsAppConfig?.apiKey) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: whatsAppQrRefreshing ? 0.7 : 1 }}
                                        >
                                            <RefreshCw size={16} /> QR novo
                                        </button>
                                        <button
                                            onClick={() => checkWhatsAppStatus()}
                                            disabled={whatsAppSending || whatsAppStatus === 'CHECKING'}
                                            style={{ flex: 1, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', borderRadius: '12px', padding: '11px 12px', fontWeight: 800, cursor: whatsAppSending || whatsAppStatus === 'CHECKING' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: whatsAppStatus === 'CHECKING' ? 0.7 : 1 }}
                                        >
                                            <RefreshCw size={16} /> Verificar conexão
                                        </button>
                                        <Link
                                            to="/admin/mensagens/configuracoes"
                                            style={{ flex: 1, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', borderRadius: '12px', padding: '11px 12px', fontWeight: 800, textDecoration: 'none', textAlign: 'center' }}
                                        >
                                            Configurações
                                        </Link>
                                    </div>
                                </div>
                                )}

                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', background: '#fff' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                                        <div style={{ background: '#f8fafc', borderRadius: '14px', padding: '12px', textAlign: 'center' }}>
                                            <div style={{ color: '#0f172a', fontWeight: 900, fontSize: '1.4rem' }}>{jogadores.length}</div>
                                            <div style={{ color: '#64748b', fontSize: '0.74rem', fontWeight: 800 }}>Convocados</div>
                                        </div>
                                        <div style={{ background: '#ecfdf5', borderRadius: '14px', padding: '12px', textAlign: 'center' }}>
                                            <div style={{ color: '#166534', fontWeight: 900, fontSize: '1.4rem' }}>{validWhatsAppRecipients.length}</div>
                                            <div style={{ color: '#166534', fontSize: '0.74rem', fontWeight: 800 }}>Com telefone</div>
                                        </div>
                                        <div style={{ background: '#fff7ed', borderRadius: '14px', padding: '12px', textAlign: 'center' }}>
                                            <div style={{ color: '#9a3412', fontWeight: 900, fontSize: '1.4rem' }}>{convocacaoRecipients.length - validWhatsAppRecipients.length}</div>
                                            <div style={{ color: '#9a3412', fontSize: '0.74rem', fontWeight: 800 }}>Sem telefone</div>
                                        </div>
                                    </div>

                                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>Prévia da mensagem</label>
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '13px', color: '#334155', fontSize: '0.86rem', whiteSpace: 'pre-wrap', maxHeight: '170px', overflowY: 'auto' }}>
                                        {validWhatsAppRecipients[0]?.message || 'Nenhum destinatário válido para gerar prévia.'}
                                    </div>
                                </div>
                            </div>

                            {whatsAppPanelTab === 'send' ? (
                                <>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', overflow: 'hidden', background: '#fff' }}>
                                        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', background: '#f8fafc' }}>
                                            <div style={{ fontWeight: 900, color: '#0f172a' }}>Destinatários da convocação</div>
                                            {whatsAppSending && (
                                                <div style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 900 }}>
                                                    {whatsAppProgress.current}/{whatsAppProgress.total} enviando
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                            {convocacaoRecipients.length === 0 && (
                                                <div style={{ padding: '18px', color: '#94a3b8', textAlign: 'center' }}>Nenhum jogador na convocação.</div>
                                            )}
                                            {convocacaoRecipients.map(item => {
                                                const log = whatsAppSendLogs.find(entry => entry.id === item.id);
                                                const hasPhone = item.phone.length >= 12;
                                                const manualSent = manualSentIds.has(item.id);
                                                return (
                                                    <div key={item.id} style={{ padding: '13px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                                                            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#f1f5f9', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                {item.jogador.photo
                                                                    ? <img src={item.jogador.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                    : <Users size={18} color="#94a3b8" />}
                                                            </div>
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.jogador.nome}</div>
                                                                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Resp.: {item.responsavel} • {item.formattedPhone}</div>
                                                                {whatsAppSendMode === 'auto' && log && <div style={{ marginTop: '3px', fontSize: '0.76rem', color: log.status === 'success' ? '#166534' : log.status === 'error' ? '#b91c1c' : '#64748b' }}>{log.log}</div>}
                                                            </div>
                                                        </div>
                                                        {whatsAppSendMode === 'manual' ? (
                                                            !hasPhone ? (
                                                                <span style={{ flexShrink: 0, padding: '6px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 900, color: '#9a3412', background: '#ffedd5' }}>
                                                                    Sem telefone
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => openManualWhatsApp(item)}
                                                                    title="Abrir o WhatsApp com a mensagem pronta"
                                                                    style={{
                                                                        flexShrink: 0,
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '6px',
                                                                        padding: '8px 14px',
                                                                        borderRadius: '999px',
                                                                        fontSize: '0.78rem',
                                                                        fontWeight: 900,
                                                                        cursor: 'pointer',
                                                                        border: manualSent ? '1px solid #bbf7d0' : 'none',
                                                                        color: manualSent ? '#166534' : '#fff',
                                                                        background: manualSent ? '#ecfdf5' : '#25D366',
                                                                        boxShadow: manualSent ? 'none' : '0 3px 8px rgba(37,211,102,0.3)'
                                                                    }}
                                                                >
                                                                    <Send size={14} /> {manualSent ? 'Reenviar' : 'Enviar'}
                                                                </button>
                                                            )
                                                        ) : (
                                                            <span style={{
                                                                flexShrink: 0,
                                                                padding: '6px 9px',
                                                                borderRadius: '999px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 900,
                                                                color: !hasPhone ? '#9a3412' : log?.status === 'success' ? '#166534' : log?.status === 'error' ? '#991b1b' : log?.status === 'sending' ? '#1d4ed8' : '#475569',
                                                                background: !hasPhone ? '#ffedd5' : log?.status === 'success' ? '#dcfce7' : log?.status === 'error' ? '#fee2e2' : log?.status === 'sending' ? '#dbeafe' : '#f1f5f9'
                                                            }}>
                                                                {!hasPhone ? 'Sem telefone' : log?.status === 'success' ? 'Enviado' : log?.status === 'error' ? 'Erro' : log?.status === 'sending' ? 'Enviando' : 'Pronto'}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexDirection: isMobile ? 'column' : 'row' }}>
                                        <button
                                            onClick={() => setIsWhatsAppPanelOpen(false)}
                                            disabled={whatsAppSending}
                                            style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 900, cursor: whatsAppSending ? 'not-allowed' : 'pointer' }}
                                        >
                                            Fechar
                                        </button>
                                        {whatsAppSendMode === 'manual' ? (
                                            <div style={{ flex: 2, padding: '13px', borderRadius: '12px', border: '1px solid #bbf7d0', background: '#ecfdf5', color: '#166534', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem', textAlign: 'center' }}>
                                                <Send size={17} />
                                                {manualSentIds.size}/{validWhatsAppRecipients.length} aviso(s) aberto(s) no WhatsApp
                                            </div>
                                        ) : (
                                            <button
                                                onClick={sendConvocacaoWhatsApp}
                                                disabled={whatsAppSending || whatsAppStatus !== 'CONNECTED' || validWhatsAppRecipients.length === 0}
                                                style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: (whatsAppSending || whatsAppStatus !== 'CONNECTED' || validWhatsAppRecipients.length === 0) ? '#cbd5e1' : '#25D366', color: '#fff', fontWeight: 900, cursor: (whatsAppSending || whatsAppStatus !== 'CONNECTED' || validWhatsAppRecipients.length === 0) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                            >
                                                <Send size={17} />
                                                {whatsAppSending ? 'Enviando com intervalo de 8s...' : `Confirmar e enviar ${validWhatsAppRecipients.length} aviso(s)`}
                                            </button>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', background: '#fff' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 0.8fr) minmax(0, 1.2fr)', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>Número para teste</label>
                                            <input
                                                type="tel"
                                                value={whatsAppTestPhone}
                                                onChange={e => {
                                                    setWhatsAppTestPhone(e.target.value);
                                                    setWhatsAppTestStatus('idle');
                                                    setWhatsAppTestLog('');
                                                }}
                                                placeholder="Ex: 5533998200546"
                                                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 13px', fontSize: '0.95rem', outline: 'none', fontWeight: 700 }}
                                            />

                                            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase', margin: '14px 0 8px' }}>Aluno modelo</label>
                                            <select
                                                value={whatsAppTestModelId}
                                                onChange={e => {
                                                    setWhatsAppTestModelId(e.target.value);
                                                    setWhatsAppTestStatus('idle');
                                                    setWhatsAppTestLog('');
                                                }}
                                                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px 13px', fontSize: '0.95rem', outline: 'none', fontWeight: 700, background: '#fff' }}
                                            >
                                                {convocacaoRecipients.map(item => (
                                                    <option key={item.id} value={item.id}>{item.jogador.nome}</option>
                                                ))}
                                            </select>

                                            {whatsAppTestStatus !== 'idle' && (
                                                <div style={{
                                                    marginTop: '14px',
                                                    padding: '12px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 800,
                                                    color: whatsAppTestStatus === 'success' ? '#166534' : whatsAppTestStatus === 'error' ? '#991b1b' : '#1d4ed8',
                                                    background: whatsAppTestStatus === 'success' ? '#dcfce7' : whatsAppTestStatus === 'error' ? '#fee2e2' : '#dbeafe'
                                                }}>
                                                    {whatsAppTestStatus === 'sending' ? 'Enviando teste...' : whatsAppTestLog}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>Prévia com aluno escolhido</label>
                                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '13px', color: '#334155', fontSize: '0.86rem', whiteSpace: 'pre-wrap', minHeight: '180px', maxHeight: '260px', overflowY: 'auto' }}>
                                                {selectedWhatsAppTestModel?.message || 'Escolha um aluno da convocação para gerar a prévia.'}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexDirection: isMobile ? 'column' : 'row' }}>
                                        <button
                                            onClick={() => setIsWhatsAppPanelOpen(false)}
                                            disabled={whatsAppTestStatus === 'sending'}
                                            style={{ flex: 1, padding: '13px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 900, cursor: whatsAppTestStatus === 'sending' ? 'not-allowed' : 'pointer' }}
                                        >
                                            Fechar
                                        </button>
                                        <button
                                            onClick={whatsAppSendMode === 'manual' ? openManualWhatsAppTest : sendConvocacaoWhatsAppTest}
                                            disabled={whatsAppTestStatus === 'sending' || (whatsAppSendMode === 'auto' && whatsAppStatus !== 'CONNECTED') || !whatsAppTestPhone.trim() || !selectedWhatsAppTestModel}
                                            style={{ flex: 2, padding: '13px', borderRadius: '12px', border: 'none', background: (whatsAppTestStatus === 'sending' || (whatsAppSendMode === 'auto' && whatsAppStatus !== 'CONNECTED') || !whatsAppTestPhone.trim() || !selectedWhatsAppTestModel) ? '#cbd5e1' : '#0ea5e9', color: '#fff', fontWeight: 900, cursor: (whatsAppTestStatus === 'sending' || (whatsAppSendMode === 'auto' && whatsAppStatus !== 'CONNECTED') || !whatsAppTestPhone.trim() || !selectedWhatsAppTestModel) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                        >
                                            <Send size={17} />
                                            {whatsAppTestStatus === 'sending' ? 'Enviando teste...' : (whatsAppSendMode === 'manual' ? 'Abrir teste no WhatsApp' : 'Enviar teste')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <ConvocacaoImageModal
                isOpen={isImageModalOpen}
                convocacao={convocacao}
                onClose={() => setIsImageModalOpen(false)}
            />
        </div>
    );
}
