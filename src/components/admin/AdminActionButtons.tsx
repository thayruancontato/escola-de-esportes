

import { Check, Edit, Trash2, Archive, RefreshCw } from 'lucide-react';

interface AdminActionButtonsProps {
    contractStatus: string;
    isEditing: boolean;
    onToggleEdit: () => void;
    onApprove: () => void;
    onDelete: () => void;
    onDeactivate?: () => void;
    onReactivate?: () => void;
    canEdit?: boolean;
}

const buttonStyle: React.CSSProperties = {
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 'bold',
    fontSize: '1rem',
    minHeight: '50px',
    padding: '14px 28px',
    flex: '1 1 auto',
    whiteSpace: 'nowrap',
};

export default function AdminActionButtons({
    contractStatus, isEditing, onToggleEdit, onApprove, onDelete, onDeactivate, onReactivate, canEdit = true
}: AdminActionButtonsProps) {

    // If no permission, hide EVERYTHING
    if (!canEdit) return null;

    return (
        <div className="admin-action-bar-wrap" style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#fff',
            borderTop: '1px solid #eee',
            padding: '15px 20px',
            paddingBottom: 'calc(15px + env(safe-area-inset-bottom, 0))',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
            zIndex: 1000
        }}>
            <style>{`
                .admin-action-bar {
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                    max-width: 900px;
                    margin: 0 auto;
                }
                @media (max-width: 640px) {
                    .admin-action-bar-wrap {
                        padding: 10px 10px calc(10px + env(safe-area-inset-bottom, 0)) !important;
                    }
                    .admin-action-bar {
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .admin-action-bar button {
                        flex: 1 1 calc(50% - 4px) !important;
                        padding: 10px 6px !important;
                        font-size: 0.78rem !important;
                        min-height: 44px !important;
                        gap: 5px !important;
                    }
                }
            `}</style>
            <div className="admin-action-bar">
                {isEditing ? (
                    <>
                        <button onClick={onToggleEdit}
                            className="touch-feedback"
                            style={{
                                ...buttonStyle,
                                background: '#198754',
                                color: '#fff',
                                boxShadow: '0 4px 12px rgba(25, 135, 84, 0.3)'
                            }}
                        >
                            <Check size={20} /> Salvar Alterações
                        </button>
                        <button onClick={onToggleEdit}
                            className="touch-feedback"
                            style={{
                                ...buttonStyle,
                                background: '#f8f9fa',
                                color: '#666',
                                border: '1px solid #ddd',
                            }}>
                            Cancelar
                        </button>
                    </>
                ) : (
                    <>
                        {contractStatus !== 'aprovado' && (
                            <button onClick={onApprove}
                                className="touch-feedback"
                                style={{
                                    ...buttonStyle,
                                    background: '#198754',
                                    color: '#fff',
                                    boxShadow: '0 4px 12px rgba(25, 135, 84, 0.3)'
                                }}
                            >
                                <Check size={20} /> Aprovar
                            </button>
                        )}
                        <button onClick={onToggleEdit}
                            className="touch-feedback"
                            style={{
                                ...buttonStyle,
                                background: '#e3f2fd',
                                color: '#1565c0',
                            }}>
                            <Edit size={20} /> Editar
                        </button>

                        {contractStatus === 'desativado' ? (
                            <button onClick={onReactivate}
                                className="touch-feedback"
                                style={{
                                    ...buttonStyle,
                                    background: '#e8f5e9',
                                    color: '#2e7d32',
                                }}>
                                <RefreshCw size={20} /> Reativar
                            </button>
                        ) : (
                            <button onClick={onDeactivate}
                                className="touch-feedback"
                                style={{
                                    ...buttonStyle,
                                    background: '#fff3e0',
                                    color: '#e65100',
                                }}>
                                <Archive size={20} /> Desativar
                            </button>
                        )}

                        <button onClick={onDelete}
                            className="touch-feedback"
                            style={{
                                ...buttonStyle,
                                background: '#ffebee',
                                color: '#c62828',
                            }}>
                            <Trash2 size={20} /> Excluir
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
