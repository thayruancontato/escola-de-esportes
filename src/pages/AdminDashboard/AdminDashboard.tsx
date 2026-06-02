import { useNavigate } from 'react-router-dom';
import { Header } from './components/Header';
import { SearchArea } from './components/SearchArea';
import { ModalityTabs } from './components/ModalityTabs';
import { ListView } from './components/ListView';
import { ExportModal } from './components/ExportModal';
import { MobileFooter } from './components/MobileFooter';
import { useAdminDashboard } from './hooks/useAdminDashboard';
import { useMessaging } from './hooks/useMessaging';
import type { AdminDashboardProps } from './types';

export default function AdminDashboard({ filterStatus }: AdminDashboardProps) {
    const navigate = useNavigate();
    const {
        allStudents, turmas, plans, loading, activeModality, searchTerm, setSearchTerm,
        sortBy, setSortBy, isExportModalOpen, setIsExportModalOpen, selectedColumns, isMobile, filteredStudents,
        handleModalityClick, handleGeneratePDF, toggleColumn
    } = useAdminDashboard(filterStatus);

    const { handleResendApproval } = useMessaging(turmas);

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#fcfcfc', overflow: 'hidden' }}>
            <div style={{ padding: isMobile ? '10px 15px' : '15px 25px 5px 25px', background: '#fff', borderBottom: '1px solid #eee', flexShrink: 0 }}>
                <Header filterStatus={filterStatus} isMobile={isMobile} filteredCount={filteredStudents.length} onExportClick={() => setIsExportModalOpen(true)} />
                <SearchArea isMobile={isMobile} searchTerm={searchTerm} onSearchChange={setSearchTerm} sortBy={sortBy} onSortChange={setSortBy} />
                {!isMobile && <ModalityTabs activeModality={activeModality} allStudents={allStudents} filterStatus={filterStatus} onModalityClick={handleModalityClick} />}
            </div>  

            <ListView students={filteredStudents} isMobile={isMobile} loading={loading} turmas={turmas} plans={plans} onNavigate={(id) => navigate(`/admin/details/${id}`)} onResendApproval={handleResendApproval} activeModality={activeModality} filterStatus={filterStatus} />

            {isMobile && <MobileFooter activeModality={activeModality} allStudents={allStudents} filterStatus={filterStatus} onModalityClick={handleModalityClick} onExportClick={() => setIsExportModalOpen(true)} />}

            <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} activeModality={activeModality} selectedColumns={selectedColumns} onColumnToggle={toggleColumn} onGenerate={(pdfSortBy) => handleGeneratePDF(pdfSortBy)} currentSortBy={sortBy} />
        </div>
    );
}
