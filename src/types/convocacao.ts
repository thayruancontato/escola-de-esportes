export interface ConvocacaoJogador {
    id: string; // unique identifier (uniqueId)
    regId?: string; // registration document identifier
    nome: string;
    photo?: string;
    turma?: string;
    categoria: 'titular' | 'reserva';
    numero?: string;
    responsavel?: string;
}

export interface Convocacao {
    id?: string;
    jogo: string;
    dataUnix: number; // For sorting
    criadoEm?: number; // Unix ms de quando a convocação foi criada, usado como ano na arte
    tecnico?: string;
    auxiliar?: string;
    rivalNome?: string;
    rivalLogo?: string;
    casaNome?: string;
    casaLogo?: string;
    showPhotos?: boolean;
    showNumbers?: boolean;
    showDataJogo?: boolean;
    jogadores: ConvocacaoJogador[];
}
