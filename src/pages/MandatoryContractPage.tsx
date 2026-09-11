import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { AlertCircle, ChevronRight, LogOut } from 'lucide-react';
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import ContractEditor from '../components/contracts/ContractEditor';
import SignatureCanvas from '../components/SignatureCanvas';
import { signOut } from 'firebase/auth';
import { notifyAdminContractSigned } from '../utils/adminNotifications';

// Tempo máximo esperando o Firestore confirmar o salvamento (internet lenta/instável)
const SAVE_TIMEOUT_MS = 20000;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Busca, entre todas as matrículas do responsável, o primeiro aluno com contrato gerado e ainda sem assinatura
const findFirstPendingSignature = async (email: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    const q = query(collection(db, "uba_2026_registrations"), where("responsavel.email", "==", normalizedEmail));
    const snap = await getDocs(q);

    for (const d of snap.docs) {
        const data = d.data();
        // Only count if contract is marked as generated (default to true for legacy)
        if (data.contractGenerated === false) continue;

        const pendingIndex = (data.alunos || []).findIndex((a: any) => !a.signatureData);
        if (pendingIndex !== -1) {
            return { hasRegistrations: true, pending: { registrationId: d.id, data, index: pendingIndex } };
        }
    }

    return { hasRegistrations: !snap.empty, pending: null };
};


export default function MandatoryContractPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [studentData, setStudentData] = useState<any>(null);
    const [registrationId, setRegistrationId] = useState<string | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showFullContract, setShowFullContract] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (!user || !user.email) {
                // Not logged in
                setLoading(false);
                navigate('/aluno/login');
                return;
            }

            try {
                const { hasRegistrations, pending } = await findFirstPendingSignature(user.email);

                if (!hasRegistrations) {
                    navigate('/aluno/login');
                } else if (!pending) {
                    // All students in all registrations are signed
                    navigate('/aluno/dashboard');
                } else {
                    setRegistrationId(pending.registrationId);
                    setStudentData(pending.data);
                    setCurrentIndex(pending.index);
                }
            } catch (error) {
                console.error("Error checking contract:", error);
            } finally {
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, [navigate]);

    const handleLogout = async () => {
        await signOut(auth);
        localStorage.removeItem('uba_student_auth');
        navigate('/aluno/login');
    };

    const handleSaveSignature = async (signatureDataUrl: string) => {
        if (!registrationId || !studentData || saving) return;

        if (!navigator.onLine) {
            alert("Você está sem internet. Verifique sua conexão e toque em Confirmar novamente.");
            return;
        }

        setSaving(true);

        try {
            const updatedAlunos = [...studentData.alunos];
            updatedAlunos[currentIndex] = {
                ...updatedAlunos[currentIndex],
                signatureData: signatureDataUrl,
                signedAt: new Date().toISOString()
            };

            const docRef = doc(db, 'uba_2026_registrations', registrationId);
            // Sem o timeout, com internet ruim o updateDoc fica esperando indefinidamente e nada acontece na tela
            await withTimeout(updateDoc(docRef, { alunos: updatedAlunos }), SAVE_TIMEOUT_MS);

            const nextPendingIndex = updatedAlunos.findIndex((a: any) => !a.signatureData);

            if (nextPendingIndex !== -1) {
                // Ainda há alunos sem assinar neste registro
                setStudentData({ ...studentData, alunos: updatedAlunos });
                setCurrentIndex(nextPendingIndex);
                setShowFullContract(false);
                window.scrollTo(0, 0);
                alert("Assinatura salva! Temos mais um aluno pendente. Por favor, assine agora o contrato do próximo atleta.");
                return;
            }

            // Todos os alunos deste registro assinaram — notifica o admin em background
            const signedAluno = updatedAlunos[currentIndex];
            const signedAt = signedAluno.signedAt as string;

            // Busca dados completos do registro para montar a notificação
            getDoc(doc(db, 'uba_2026_registrations', registrationId))
                .then(snap => {
                    if (!snap.exists()) return;
                    const reg = snap.data() as any;
                    const primeiroAluno = reg.alunos?.[0];
                    notifyAdminContractSigned({
                        registrationId,
                        nome: primeiroAluno?.nome || updatedAlunos[0]?.nome || 'Aluno',
                        modalidade: reg.modalidade,
                        fotoUrl: primeiroAluno?.fotoUrl,
                        responsavelNome: reg.responsavel?.nome,
                        telefone: reg.responsavel?.telefonePrincipal,
                        signedAt,
                    }).catch(err => console.error('Falha ao notificar admin sobre contrato assinado:', err));
                })
                .catch(err => console.error('Falha ao buscar dados para notificação de contrato:', err));

            // O responsável pode ter outra matrícula com contrato pendente (ex.: outra modalidade).
            // Antes, ia para o painel, que redirecionava de volta para esta tela e parecia que a assinatura não tinha sido salva.
            const email = auth.currentUser?.email;
            const next = email
                ? await findFirstPendingSignature(email).then(r => r.pending).catch(() => null)
                : null;

            if (next) {
                setRegistrationId(next.registrationId);
                setStudentData(next.data);
                setCurrentIndex(next.index);
                setShowFullContract(false);
                window.scrollTo(0, 0);
                const nextNome = next.data.alunos?.[next.index]?.nome || 'outro aluno';
                const nextModalidade = next.data.modalidade ? ` (${next.data.modalidade})` : '';
                alert(`Assinatura salva! Ainda falta assinar o contrato de ${nextNome}${nextModalidade}.`);
            } else {
                alert("Todas as assinaturas desta matrícula foram concluídas!");
                navigate('/aluno/dashboard');
            }
        } catch (error: any) {
            console.error("Erro ao salvar assinatura:", error);
            if (error?.message === 'timeout') {
                alert("A internet está lenta e não conseguimos confirmar o salvamento. Verifique sua conexão e toque em Confirmar novamente.");
            } else {
                alert("Erro ao salvar a assinatura. Tente novamente.");
            }
        } finally {
            setSaving(false);
        }
    };


    if (loading) {
        return (
            <div style={{
                height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: '15px', color: '#00237f'
            }}>
                <div className="spinner"></div>
                <div>Verificando...</div>
            </div>
        );
    }

    const currentStudentName = studentData?.alunos?.[currentIndex]?.nome || 'Aluno';

    return (
        <div style={{ background: '#f5f7fa', minHeight: '100vh' }}>
            {/* Header Alert - Drastically Compact */}
            <div style={{
                background: '#c32228', color: '#fff', padding: '8px',
                textAlign: 'center', position: 'sticky', top: 0, zIndex: 1000,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
                <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <AlertCircle size={16} />
                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>ASSINATURA OBRIGATÓRIA: {currentStudentName.toUpperCase()}</span>
                </div>
            </div>

            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '10px' }}>
                {!showFullContract ? (
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                        <img
                            src="/assinar-contrato.png"
                            alt="Assinar Contrato"
                            style={{ width: '200px', height: 'auto', margin: '0 auto 5px', display: 'block' }}
                        />
                        {/* INTRO CARD - Much more compact */}
                        <div style={{
                            background: '#fff', borderRadius: '12px',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.05)', padding: '20px', textAlign: 'center'
                        }}>

                            <h2 style={{ fontSize: '1.2rem', color: '#111', marginBottom: '5px' }}>Assinatura de Contrato</h2>
                            <p style={{ color: '#666', lineHeight: '1.4', fontSize: '0.9rem', marginBottom: '15px' }}>
                                Assine o contrato do aluno(a) <strong>{currentStudentName}</strong> para liberar seu acesso ao portal.
                            </p>

                            {/* Mini Preview Box */}
                            <div style={{
                                background: '#f8f9fa', padding: '12px', borderRadius: '10px',
                                border: '1px solid #edf2f7', marginBottom: '15px', textAlign: 'left'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#718096', textTransform: 'uppercase' }}>Documento</div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#2d3748' }}>
                                            Contrato Escolinha 2026{studentData?.modalidade ? ` · ${studentData.modalidade}` : ''}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowFullContract(true)}
                                        style={{
                                            background: '#fff', border: '1px solid #cbd5e0', padding: '6px 12px',
                                            borderRadius: '6px', color: '#4a5568', fontWeight: 'bold', fontSize: '0.8rem',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                            transition: 'all 0.2s', whiteSpace: 'nowrap'
                                        }}
                                    >
                                        VER CONTRATO <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Signature Section */}
                            <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
                                <h3 style={{ fontSize: '0.95rem', marginBottom: '10px', color: '#333' }}>Sua Assinatura:</h3>
                                {/* O "Confirmar" do canvas já salva direto. Antes ele só capturava a assinatura e o botão
                                    de salvar aparecia abaixo, fora da tela no celular — parecia que nada acontecia.
                                    A key recria o canvas limpo ao trocar de aluno/matrícula. */}
                                <SignatureCanvas
                                    key={`${registrationId}-${currentIndex}`}
                                    onConfirm={handleSaveSignature}
                                    saving={saving}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    // FULL CONTRACT VIEW
                    <div>
                        <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'flex-start' }}>
                            <button
                                onClick={() => setShowFullContract(false)}
                                style={{
                                    background: '#fff', border: '1px solid #ddd', padding: '6px 12px',
                                    borderRadius: '6px', color: '#666', fontWeight: 'bold', cursor: 'pointer',
                                    fontSize: '0.85rem'
                                }}
                            >
                                ← Voltar para Assinar
                            </button>
                        </div>
                        <div style={{
                            background: '#fff', borderRadius: '12px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.08)', overflow: 'hidden'
                        }}>
                            <ContractEditor
                                mode="student"
                                registrationId={registrationId || undefined}
                                studentIndex={currentIndex}
                                hideToolbar={true}
                                title={`Visualização: ${currentStudentName}`}
                            />
                        </div>
                        <div style={{ marginTop: '10px', textAlign: 'center' }}>
                            <button
                                onClick={() => { setShowFullContract(false); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100); }}
                                style={{
                                    background: '#00237f', color: '#fff', border: 'none', padding: '10px 20px',
                                    borderRadius: '50px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.95rem'
                                }}
                            >
                                JÁ LI, QUERO ASSINAR
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Compact Logout Button */}
            <div style={{ textAlign: 'center', padding: '10px 0 30px' }}>
                <button
                    onClick={handleLogout}
                    style={{
                        background: 'none', border: 'none', color: '#999', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem',
                        fontWeight: '600', opacity: 0.7
                    }}
                    onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
                >
                    <LogOut size={14} /> ENCERRAR SESSÃO / SAIR
                </button>
            </div>
        </div>
    );
}
