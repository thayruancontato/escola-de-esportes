import React, { useState } from 'react';
import { DesktopTable } from './DesktopTable';
import { MobileCard } from './MobileCard';
import type { Student, Turma } from '../types';
import type { Plan } from '../../../utils/planService';

interface ListViewProps {
    students: Student[];
    isMobile: boolean;
    loading: boolean;
    turmas: Turma[];
    plans: Plan[];
    onNavigate: (regId: string) => void;
    onResendApproval: (item: Student) => void;
    activeModality: string | null;
    filterStatus?: string;
}

export const ListView: React.FC<ListViewProps> = ({
    students, isMobile, loading, turmas, plans, onNavigate, onResendApproval, activeModality, filterStatus
}) => {
    const [visibleCount, setVisibleCount] = useState(20);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 50 && visibleCount < students.length) {
            setVisibleCount(prev => prev + 20);
        }
    };

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', height: '200px', alignItems: 'center' }}><div className="spin" style={{ width: '30px', height: '30px', border: '3px solid #f3f3f3', borderTop: '3px solid #c32228', borderRadius: '50%' }}></div></div>;

    if (!activeModality && filterStatus !== 'desativados') return <div style={{ padding: '40px', textAlign: 'center' }}><img src="/logo-dashboard.png" style={{ maxWidth: '500px', width: '80%', opacity: 0.2 }} /></div>;

    if (students.length === 0) return <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Nenhum registro encontrado.</div>;

    return (
        <div onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '10px' : '0 25px 20px 25px', WebkitOverflowScrolling: 'touch' }}>
            {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '140px' }}>
                    {students.slice(0, visibleCount).map(item => <MobileCard key={item.uniqueId} item={item} turmas={turmas} onNavigate={onNavigate} onResendApproval={onResendApproval} filterStatus={filterStatus} />)}
                </div>
            ) : (
                <DesktopTable students={students.slice(0, visibleCount)} turmas={turmas} plans={plans} onNavigate={onNavigate} onResendApproval={onResendApproval} filterStatus={filterStatus} />
            )}
        </div>
    );
};
