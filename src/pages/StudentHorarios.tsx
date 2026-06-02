import { useState } from 'react';
import { Download, Clock } from 'lucide-react';
import PageContainer from '../components/PageContainer';

type TabType = 'futebol' | 'voleibol' | 'natacao';

const tabs: { id: TabType; label: string; image: string }[] = [
    { id: 'futebol', label: 'Futebol', image: '/horarios.jpeg' },
    { id: 'voleibol', label: 'Voleibol', image: '/horarios-voleibol.jpeg' },
    { id: 'natacao', label: 'Natação / Hidro', image: '/horarios-natacao.jpeg' }
];

export default function StudentHorarios() {
    const [activeTab, setActiveTab] = useState<TabType>('futebol');

    const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = currentTab.image;
        link.download = `horarios-${activeTab}-uba-2026.jpeg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <PageContainer>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <Clock size={28} color="#c32228" />
                <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#333' }}>Horários de Atividades</h1>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                gap: '5px',
                background: '#e0e0e0',
                padding: '4px',
                borderRadius: '12px',
                marginBottom: '20px'
            }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            flex: 1,
                            padding: '10px 15px',
                            background: activeTab === tab.id ? '#fff' : 'transparent',
                            borderRadius: '10px',
                            border: 'none',
                            fontWeight: 'bold',
                            color: activeTab === tab.id ? '#c32228' : '#666',
                            cursor: 'pointer',
                            boxShadow: activeTab === tab.id ? '0 2px 5px rgba(0,0,0,0.1)' : 'none',
                            transition: 'all 0.3s',
                            fontSize: '0.85rem'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="native-card" style={{ padding: '20px', textAlign: 'center' }}>
                <p style={{ color: '#555', marginBottom: '20px', fontSize: '1rem' }}>
                    Confira abaixo os <strong>horários de {currentTab.label}</strong> disponíveis para os alunos.
                </p>

                <div style={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                    marginBottom: '20px'
                }}>
                    <img
                        src={currentTab.image}
                        alt={`Horários de ${currentTab.label}`}
                        style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block'
                        }}
                    />
                </div>

                <button
                    onClick={handleDownload}
                    className="native-btn"
                    style={{
                        background: '#c32228',
                        color: '#fff',
                        padding: '14px 30px',
                        fontSize: '1rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer'
                    }}
                >
                    <Download size={20} />
                    Baixar Imagem
                </button>
            </div>
        </PageContainer>
    );
}
