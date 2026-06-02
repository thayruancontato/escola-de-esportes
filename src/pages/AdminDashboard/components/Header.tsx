import React from 'react';
import PageTitle from '../../../components/PageTitle';
import { Download } from 'lucide-react';
import type { AdminDashboardProps } from '../types';

interface HeaderProps extends AdminDashboardProps {
    isMobile: boolean;
    filteredCount: number;
    onExportClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ filterStatus, isMobile, filteredCount, onExportClick }) => {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '8px' : '12px' }}>
            <PageTitle
                title={filterStatus === 'pendente' ? "Validar Contratos" : filterStatus === 'desativados' ? "Alunos Desativados" : "Alunos Cadastrados"}
                count={filteredCount}
                subtitle={isMobile ? "" : (filterStatus === 'pendente' ? "Aguardando verificação" : filterStatus === 'desativados' ? "Histórico de alunos inativos" : "Listagem de alunos com contrato aprovado")}
            />

            {!isMobile && (
                <button
                    onClick={onExportClick}
                    className="touch-feedback"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        background: '#c32228',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#fff',
                        fontWeight: '700',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                    }}
                >
                    <Download size={14} /> EXPORTAR
                </button>
            )}
        </div>
    );
};
