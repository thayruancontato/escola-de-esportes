import {
    Users,
    CreditCard,
    BarChart2,
    Settings,
    Cake,
    DollarSign,
    GraduationCap,
    FileText,
    ScanLine,
    CalendarDays,
    Trophy,
    Image as ImageIcon,
    MessageSquare,
    Store
} from 'lucide-react';

export interface MenuItem {
    path: string;
    label: string;
    icon: any; // Lucide icon component
    subItems?: { to: string; label: string; badge?: any }[];
}

export const ADMIN_MENU_ITEMS: MenuItem[] = [
    {
        path: '/admin/dashboard',
        label: 'Cadastros',
        icon: Users,
        subItems: [
            { to: '/admin/dashboard', label: 'Alunos Cadastrados' },
            { to: '/admin/cadastros/pendentes', label: 'Pendentes de Aprovação' }, // Badge logic handled in component
            { to: '/admin/cadastros/novo', label: 'Novo Cadastro' },
            { to: '/admin/cadastros/desativados', label: 'Alunos Desativados' }
        ]
    },
    {
        path: '/admin/aniversariantes',
        label: 'Aniversariantes',
        icon: Cake
    },
    {
        path: '/admin/financeiro',
        label: 'Financeiro',
        icon: DollarSign,
        subItems: [
            { to: '/admin/financeiro', label: 'Geral' },
            { to: '/admin/financeiro/gastos', label: 'Gastos' },
            { to: '/admin/plans', label: 'Planos' },
            { to: '/admin/financeiro/cobrancas', label: 'Cobranças' }
        ]
    },
    {
        path: '/admin/turmas',
        label: 'Turmas',
        icon: Users,
        subItems: [
            { to: '/admin/turmas', label: 'Lista de Turmas' },
            { to: '/admin/turmas/chamadas', label: 'Chamadas' }
        ]
    },
    {
        path: '/admin/professores',
        label: 'Professores',
        icon: GraduationCap
    },
    {
        path: '/admin/contratos',
        label: 'Contratos',
        icon: FileText,
        subItems: [
            { to: '/admin/contratos', label: 'Lista de Contratos' },
            { to: '/admin/contratos/modelo', label: 'Modelo de Contrato' }
        ]
    },
    {
        path: '/admin/carteirinhas',
        label: 'Carteirinhas',
        icon: CreditCard
    },
    {
        path: '/admin/stats',
        label: 'Estatísticas',
        icon: BarChart2,
        subItems: [
            { to: '/admin/stats', label: 'Visão Geral' },
            { to: '/admin/relatorios', label: 'Relatórios' },
            { to: '/admin/simulador', label: 'Simulador de Receita' }
        ]
    },
    {
        path: '/admin/settings',
        label: 'Configurações',
        icon: Settings
    },
    {
        path: '/admin/portaria',
        label: 'Portaria',
        icon: ScanLine
    },
    {
        path: '/admin/alugueis',
        label: 'Aluguel de Espaços',
        icon: CalendarDays
    },
    {
        path: '/admin/jogos',
        label: 'Jogos',
        icon: Trophy,
        subItems: [
            { to: '/admin/jogos/convocacao', label: 'Convocação' }
        ]
    },
    {
        path: '/admin/mensagens/avisos-admin',
        label: 'Mensagens',
        icon: MessageSquare,
        subItems: [
            { to: '/admin/mensagens/avisos-admin', label: 'Avisos ao Administrador' },
            { to: '/admin/financeiro/cobrancas', label: 'Cobrança Manual' }
        ]
    },
    {
        path: '/admin/midias',
        label: 'Mídias',
        icon: ImageIcon
    },
    {
        path: '/admin/store',
        label: 'Loja',
        icon: Store
    }
];
