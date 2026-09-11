import { useCallback } from 'react';
import type { Convocacao } from '../types/convocacao';

export function useConvocacaoImageGenerator() {

    const generateImage = useCallback(async (convocacao: Convocacao, layout: 'geral' | 'individual' = 'geral', highlightUrl?: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error("Canvas context not available"));
                return;
            }

            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.src = layout === 'individual' ? '/convocacao-individual.png' : '/convocacao-geral-base.png';

            img.onload = async () => {
                try {
                    await Promise.all([
                        document.fonts.load('900 100px "Montserrat"'),
                        document.fonts.load('400 100px "Anton"'),
                    ]);
                } catch (e) { /* segue com a fonte de fallback do sistema */ }

                // Set canvas dimensions to match the image exactly
                canvas.width = img.width;
                canvas.height = img.height;

                // Draw background image
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);



                // Canvas setup for text
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                const canvasW = canvas.width;
                const canvasH = canvas.height;

                // Helper to format name: First Name + Prepositions + First Surname
                const formatDisplayName = (fullName: string) => {
                    if (!fullName) return '';
                    const parts = fullName.trim().split(/\s+/);
                    if (parts.length <= 1) return fullName;

                    const prepositions = ['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'];
                    let result = parts[0];

                    for (let i = 1; i < parts.length; i++) {
                        const part = parts[i];
                        const partUpper = part.toUpperCase();
                        result += ' ' + part;
                        if (!prepositions.includes(partUpper)) {
                            break;
                        }
                    }

                    return result;
                };

                const redColor = '#E31B23';
                const darkText = '#111111';

                const titulares = convocacao.jogadores.filter(j => j.categoria === 'titular');
                const reservas = convocacao.jogadores.filter(j => j.categoria === 'reserva');

                // Data de jogo comum para ambos
                const dateObj = new Date(convocacao.dataUnix);
                const day = dateObj.getDate().toString().padStart(2, '0');
                const month = dateObj.toLocaleDateString('pt-BR', { month: '2-digit' }).toUpperCase();
                const year = dateObj.getFullYear();
                const gameTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                // HIGHLIGHT IMAGE (If layout is individual and URL provided)
                // Desenhar ANTES dos textos para garantir que o texto fique por cima (Z-Index)
                if (layout === 'individual' && highlightUrl) {
                    try {
                        const hImg = new Image();
                        hImg.crossOrigin = 'Anonymous';
                        await new Promise((res, rej) => {
                            hImg.onload = res;
                            hImg.onerror = rej;
                            hImg.src = highlightUrl;
                        });

                        const scale = (canvas.height * 0.9) / hImg.height;
                        const w = hImg.width * scale;
                        const h = canvas.height * 0.9;

                        let x = canvas.width - w - (canvas.width * 0.08);
                        if (x < canvas.width * 0.38) {
                            x = canvas.width * 0.38;
                        }

                        const y = canvas.height - h;
                        ctx.drawImage(hImg, x, y, w, h);
                    } catch (e) {
                        console.warn('Failed to load highlight image:', e);
                    }
                }

                if (layout === 'individual') {
                    // ============================================
                    // LAYOUT INDIVIDUAL (Flamengo/Copinha Style)
                    // ============================================

                    const leftMargin = canvasW * 0.085;
                    const headerMaxWidth = (canvasW * 0.62) - leftMargin;
                    const maxWidth = (canvasW * 0.5) - leftMargin; // Mantido para o corpo do texto

                    // 1. HEADER (Top Left)
                    const headerY = canvasH * 0.05;
                    const logoSize = canvasH * 0.065;

                    let textX = leftMargin;

                    const drawLogo = async (url: string, x: number, y: number, size: number) => {
                        if (!url) return;
                        try {
                            const logoImg = new Image();
                            logoImg.crossOrigin = 'Anonymous';
                            await new Promise((res, rej) => {
                                logoImg.onload = res;
                                logoImg.onerror = rej;
                                logoImg.src = url;
                            });
                            let dw = size;
                            let dh = size;
                            const ratio = logoImg.width / logoImg.height;
                            if (ratio > 1) { dh = size / ratio; } else { dw = size * ratio; }
                            ctx.drawImage(logoImg, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
                        } catch (e) { console.warn('Falha logo:', e) }
                    };

                    const hasRivalInfo = !!(convocacao.rivalNome || convocacao.rivalLogo);
                    const hasLogos = convocacao.casaLogo || convocacao.rivalLogo;
                    const isJustEvent = !hasRivalInfo; // Se não houver rival, é só o jogo.

                    let logosDrawn = 0;
                    if (hasLogos) {
                        if (convocacao.casaLogo) {
                            await drawLogo(convocacao.casaLogo, leftMargin, headerY, logoSize);
                            logosDrawn++;
                        }
                        if (convocacao.rivalLogo) {
                            await drawLogo(convocacao.rivalLogo, leftMargin + (logosDrawn * (logoSize + 5)), headerY, logoSize);
                            logosDrawn++;
                        }
                        textX = leftMargin + (logosDrawn * logoSize) + (logosDrawn > 1 ? 15 : 10);
                    }

                    // NOME DO CAMPEONATO / JOGO E CONFRONTO
                    if (isJustEvent) {
                        // Se não tem nem logo e nem nomes definidos, exibe apenas o titulo do evento gigante em vermelho
                        ctx.font = `900 ${canvasH * 0.024}px "Montserrat", sans-serif`;
                        ctx.fillStyle = redColor;
                        ctx.textAlign = 'left';
                        ctx.fillText(convocacao.jogo.toUpperCase(), textX, headerY + (logoSize * 0.45), maxWidth);
                    } else if (!hasLogos) {
                        // Sem logo, mas tem algum nome preenchido. O título do jogo fica em segundo plano.
                        ctx.font = `900 ${canvasH * 0.015}px "Montserrat", sans-serif`;
                        ctx.fillStyle = redColor;
                        ctx.textAlign = 'left';
                        ctx.fillText(convocacao.jogo.toUpperCase(), textX, headerY + (logoSize * 0.2), maxWidth);

                        // Confronto (Time da Casa em Vermelho, restante em Preto) - Proporcional e Maior
                        ctx.font = `900 ${canvasH * 0.032}px "Montserrat", sans-serif`;
                        const casaName = (convocacao.casaNome || 'UBA FC').toUpperCase();
                        const rivalName = (convocacao.rivalNome || 'RIVAL').toUpperCase();


                        const finalY = headerY + (logoSize * 0.55);
                        (ctx as any).letterSpacing = "1.5px";

                        const casaW = ctx.measureText(casaName).width;
                        const xW = ctx.measureText(' X ').width;
                        const availRival = headerMaxWidth - casaW - xW;
                        const fullRivalW = ctx.measureText(rivalName).width;

                        if (fullRivalW > availRival && rivalName.includes(' ')) {
                            // Quebra o rival: Parte 1 para CIMA, Parte 2 na linha do X
                            const words = rivalName.split(' ');
                            let r1 = "";
                            let r2 = "";

                            // Tenta encaixar as últimas palavras na linha 2 (greedy from end)
                            for (let i = words.length - 1; i >= 0; i--) {
                                const test = r2 ? words[i] + " " + r2 : words[i];
                                if (ctx.measureText(test).width <= availRival) {
                                    r2 = test;
                                } else {
                                    r1 = words.slice(0, i + 1).join(' ');
                                    break;
                                }
                            }

                            const lineHeight = (canvasH * 0.032) * 0.85;
                            const rMaxWidth = headerMaxWidth - (casaW + xW);

                            // Linha 1 (Cima)
                            ctx.fillStyle = darkText;
                            ctx.fillText(r1, textX + casaW + xW, finalY - lineHeight, rMaxWidth);

                            // Linha 2 (Principal)
                            ctx.fillStyle = redColor;
                            ctx.fillText(casaName, textX, finalY);
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillText(' X ', textX + casaW, finalY);
                            ctx.fillStyle = darkText;
                            ctx.fillText(r2, textX + casaW + xW, finalY, rMaxWidth);
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillText(casaName, textX, finalY);
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillText(' X ', textX + casaW, finalY);
                            ctx.fillStyle = darkText;
                            ctx.fillText(rivalName, textX + casaW + xW, finalY, headerMaxWidth - casaW - xW);
                        }
                        (ctx as any).letterSpacing = "0px";
                    } else {
                        // Com logo, tamanho padrao
                        ctx.font = `800 ${canvasH * 0.013}px "Montserrat", sans-serif`;
                        ctx.fillStyle = darkText;
                        ctx.textAlign = 'left';
                        ctx.fillText(convocacao.jogo.toUpperCase(), textX, headerY + (logoSize * 0.2), maxWidth);

                        // Confronto (Time da Casa em Vermelho, restante em Preto) - Proporcional e Maior
                        ctx.font = `900 ${canvasH * 0.024}px "Montserrat", sans-serif`;
                        const casaNameIndiv = (convocacao.casaNome || 'UBA FC').toUpperCase();
                        const rivalNameIndiv = (convocacao.rivalNome || 'RIVAL').toUpperCase();


                        const finalYIndiv = headerY + (logoSize * 0.55);
                        (ctx as any).letterSpacing = "1.5px";

                        const casaWIndiv = ctx.measureText(casaNameIndiv).width;
                        const xWIndiv = ctx.measureText(' X ').width;
                        const availRivalIndiv = headerMaxWidth - casaWIndiv - xWIndiv;
                        const fullRivalWIndiv = ctx.measureText(rivalNameIndiv).width;

                        if (fullRivalWIndiv > availRivalIndiv && rivalNameIndiv.includes(' ')) {
                            // Quebra o rival: Parte 1 para CIMA, Parte 2 na linha do X
                            const words = rivalNameIndiv.split(' ');
                            let r1 = "";
                            let r2 = "";

                            for (let i = words.length - 1; i >= 0; i--) {
                                const test = r2 ? words[i] + " " + r2 : words[i];
                                if (ctx.measureText(test).width <= availRivalIndiv) {
                                    r2 = test;
                                } else {
                                    r1 = words.slice(0, i + 1).join(' ');
                                    break;
                                }
                            }

                            const lineHeightIndiv = (canvasH * 0.024) * 0.85;
                            const rMaxWidthIndiv = headerMaxWidth - (casaWIndiv + xWIndiv);

                            // Linha 1 (Cima)
                            ctx.fillStyle = darkText;
                            ctx.fillText(r1, textX + casaWIndiv + xWIndiv, finalYIndiv - lineHeightIndiv, rMaxWidthIndiv);

                            // Linha 2 (Principal)
                            ctx.fillStyle = redColor;
                            ctx.fillText(casaNameIndiv, textX, finalYIndiv);
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillText(' X ', textX + casaWIndiv, finalYIndiv);
                            ctx.fillStyle = darkText;
                            ctx.fillText(r2, textX + casaWIndiv + xWIndiv, finalYIndiv, rMaxWidthIndiv);
                        } else {
                            ctx.fillStyle = redColor;
                            ctx.fillText(casaNameIndiv, textX, finalYIndiv);
                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillText(' X ', textX + casaWIndiv, finalYIndiv);
                            ctx.fillStyle = darkText;
                            ctx.fillText(rivalNameIndiv, textX + casaWIndiv + xWIndiv, finalYIndiv, headerMaxWidth - casaWIndiv - xWIndiv);
                        }
                        (ctx as any).letterSpacing = "0px";
                    }

                    // DATA E HORA
                    if (convocacao.showDataJogo !== false) {
                        ctx.font = `800 ${canvasH * 0.013}px "Montserrat", sans-serif`;
                        ctx.fillStyle = darkText;
                        const dateText = `${day}/${month}/${year} - ${gameTime}H`;
                        ctx.fillText(dateText, textX, headerY + (logoSize * 0.9), maxWidth);
                    }

                    // 2. TITULARES
                    const startYTits = convocacao.showDataJogo !== false ? canvasH * 0.155 : canvasH * 0.135;
                    const lineHeight = canvasH * 0.027;

                    for (let i = 0; i < titulares.length; i++) {
                        const t = titulares[i];
                        const y = startYTits + (i * lineHeight);

                        let nameX = leftMargin;
                        if (t.numero && convocacao.showNumbers !== false) {
                            ctx.font = `800 ${canvasH * 0.016}px "Montserrat", sans-serif`;
                            ctx.fillStyle = redColor;
                            ctx.textAlign = 'left';
                            ctx.fillText(t.numero, leftMargin, y);
                            nameX = leftMargin + (canvasW * 0.04);
                        }

                        ctx.font = `800 ${canvasH * 0.015}px "Montserrat", sans-serif`;
                        ctx.fillStyle = darkText;
                        ctx.textAlign = 'left';
                        (ctx as any).letterSpacing = "-1px";

                        // Limit width of names
                        const maxNameWidth = maxWidth - (nameX - leftMargin);

                        ctx.save();
                        ctx.scale(1, 1.12);
                        ctx.fillText(formatDisplayName(t.nome).toUpperCase(), nameX, y / 1.12, maxNameWidth);
                        ctx.restore();

                        (ctx as any).letterSpacing = "0px";
                    }



                    // 4. RESERVAS (Uma coluna vertical, começa abaixo do RESERVAS : que está na arte estática)
                    const resStartLineY = canvasH * 0.63;
                    const resLineHeight = canvasH * 0.016;
                    const colX = leftMargin;
                    const resMaxWidth = maxWidth;

                    for (let i = 0; i < reservas.length; i++) {
                        const r = reservas[i];
                        const rY = resStartLineY + (i * resLineHeight);

                        let rNameX = colX;
                        if (r.numero && convocacao.showNumbers !== false) {
                            ctx.font = `800 ${canvasH * 0.0115}px "Montserrat", sans-serif`;
                            ctx.fillStyle = darkText;
                            ctx.textAlign = 'left';
                            ctx.fillText(r.numero, colX, rY);
                            rNameX = colX + (canvasW * 0.035);
                        }

                        ctx.font = `800 ${canvasH * 0.0105}px "Montserrat", sans-serif`;
                        ctx.fillStyle = '#FFFFFF';
                        ctx.textAlign = 'left';
                        (ctx as any).letterSpacing = "-1px";

                        const maxResNameWidth = resMaxWidth - (rNameX - colX);

                        ctx.save();
                        ctx.scale(1, 1.12);
                        ctx.fillText(formatDisplayName(r.nome).toUpperCase(), rNameX, rY / 1.12, maxResNameWidth);
                        ctx.restore();

                        (ctx as any).letterSpacing = "0px";
                    }

                    // 5. TÉCNICO (Posicionado logo acima da linha vermelha do rodapé)
                    if (convocacao.tecnico) {
                        const techY = canvasH * 0.815;
                        ctx.font = `800 ${canvasH * 0.014}px "Montserrat", sans-serif`;
                        ctx.textAlign = 'left';

                        ctx.fillStyle = darkText;
                        ctx.fillText('TÉC. ', leftMargin, techY);

                        const techWidth = ctx.measureText('TÉC. ').width;
                        ctx.fillStyle = '#FFFFFF';
                        const maxTechNameWidth = maxWidth - techWidth;
                        ctx.fillText(convocacao.tecnico.toUpperCase(), leftMargin + techWidth, techY, maxTechNameWidth);
                    }

                } else {
                    // ============================================
                    // LAYOUT GERAL (Modelo Copa Diamante)
                    // ============================================
                    const NAVY = '#0B1B3F';
                    const RED_NEW = '#C40404';
                    const leftMargin = canvasW * 0.0625;
                    const rightEdge = canvasW * 0.9336;

                    const wrapWords = (words: string[], maxWidth: number) => {
                        const lines: string[] = [];
                        let current = '';
                        for (const w of words) {
                            const test = current ? `${current} ${w}` : w;
                            if (!current || ctx.measureText(test).width <= maxWidth) {
                                current = test;
                            } else {
                                lines.push(current);
                                current = w;
                            }
                        }
                        if (current) lines.push(current);
                        return lines;
                    };

                    // 1. TÍTULO DO JOGO (entre a linha de estrelas e o selo vermelho)
                    // Calcula o MAIOR tamanho de fonte possível que caiba em até 2 linhas,
                    // respeitando tanto a largura quanto a altura do espaço disponível.
                    const jogoRaw = (convocacao.jogo || '').trim();
                    const titleWordsUpper = jogoRaw.split(/\s+/).filter(Boolean).map(w => w.toUpperCase());

                    const titleCenterX = canvasW * 0.345; // mesmo centro do selo vermelho e da linha de estrelas
                    const titleMaxWidth = canvasW * 0.58;
                    const titleGapTop = canvasH * 0.118;
                    const titleGapBottom = canvasH * 0.27;
                    const titleGapHeight = titleGapBottom - titleGapTop;
                    const titlePitchFactor = 1.05; // espaço vertical entre o centro de cada linha

                    ctx.textAlign = 'center';
                    ctx.fillStyle = NAVY;

                    if (titleWordsUpper.length > 0) {
                        // Sem limite fixo de linhas: o título nunca perde palavras, só encolhe até caber na altura disponível
                        const tryFit = (size: number): string[] | null => {
                            ctx.font = `400 ${size}px "Anton", sans-serif`;
                            const lines = wrapWords(titleWordsUpper, titleMaxWidth);
                            const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
                            if (widest > titleMaxWidth) return null;
                            const neededHeight = lines.length * size * titlePitchFactor;
                            if (neededHeight > titleGapHeight) return null;
                            return lines;
                        };

                        let lo = canvasH * 0.014;
                        let hi = canvasH * 0.085;
                        let bestSize = lo;
                        let bestLines: string[];
                        ctx.font = `400 ${lo}px "Anton", sans-serif`;
                        bestLines = tryFit(lo) || wrapWords(titleWordsUpper, titleMaxWidth);

                        for (let i = 0; i < 22; i++) {
                            const mid = (lo + hi) / 2;
                            const lines = tryFit(mid);
                            if (lines) {
                                bestSize = mid;
                                bestLines = lines;
                                lo = mid;
                            } else {
                                hi = mid;
                            }
                        }

                        ctx.font = `400 ${bestSize}px "Anton", sans-serif`;
                        const pitch = bestSize * titlePitchFactor;
                        const blockCenterY = (titleGapTop + titleGapBottom) / 2;
                        const startY = blockCenterY - ((bestLines.length - 1) * pitch) / 2;
                        ctx.strokeStyle = '#fdfdfd';
                        ctx.lineWidth = Math.max(2, bestSize * 0.05);
                        ctx.lineJoin = 'round';
                        bestLines.forEach((line, i) => {
                            const lineY = startY + (i * pitch);
                            ctx.strokeText(line, titleCenterX, lineY, titleMaxWidth);
                            ctx.fillText(line, titleCenterX, lineY, titleMaxWidth);
                        });
                    }
                    ctx.textAlign = 'left';

                    // Selo vermelho: ano em que a convocação foi criada
                    const yearBadge = new Date(convocacao.criadoEm || convocacao.dataUnix || Date.now()).getFullYear().toString();
                    ctx.font = `400 ${canvasH * 0.033}px "Anton", sans-serif`;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.textAlign = 'center';
                    ctx.fillText(yearBadge, titleCenterX, canvasH * 0.306);
                    ctx.textAlign = 'left';

                    // 2. CAIXA DE CATEGORIA + INFOS DO JOGO
                    const catBoxX = leftMargin;
                    const catBoxY = canvasH * 0.3928;
                    const catBoxW = canvasW * 0.2529;
                    const catBoxH = canvasH * 0.0965;

                    // Categoria = turma mais comum entre os convocados (ex: "Sub 11")
                    const turmaCounts = new Map<string, number>();
                    convocacao.jogadores.forEach(j => {
                        const t = (j.turma || '').trim();
                        if (t) turmaCounts.set(t, (turmaCounts.get(t) || 0) + 1);
                    });
                    let categoria = '';
                    let bestCount = 0;
                    turmaCounts.forEach((count, turma) => {
                        if (count > bestCount) { bestCount = count; categoria = turma; }
                    });
                    categoria = categoria.toUpperCase();

                    if (categoria) {
                        ctx.font = `400 ${canvasH * 0.036}px "Anton", sans-serif`;
                        ctx.fillStyle = '#FFFFFF';
                        ctx.textAlign = 'center';
                        ctx.fillText(categoria, catBoxX + (catBoxW / 2), catBoxY + (catBoxH / 2), catBoxW * 0.85);
                        ctx.textAlign = 'left';
                    }

                    // Infos (dia / hora / confronto) na área branca à direita da caixa de categoria
                    const infoX = canvasW * 0.352;
                    const infoMaxWidth = rightEdge - infoX - (canvasW * 0.015);
                    const infoLine1Y = catBoxY + (catBoxH * 0.285);
                    const infoLine2Y = catBoxY + (catBoxH * 0.595);
                    const infoLine3Y = catBoxY + (catBoxH * 0.88);
                    const infoFont = canvasH * 0.0175;

                    ctx.font = `800 ${infoFont}px "Montserrat", sans-serif`;
                    ctx.fillStyle = NAVY;

                    if (convocacao.showDataJogo !== false) {
                        const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' }).toUpperCase();
                        ctx.fillText(`${weekday} – ${day}/${month}`, infoX, infoLine1Y, infoMaxWidth);
                        ctx.fillText(`${gameTime}${categoria ? ` – ${categoria}` : ''}`, infoX, infoLine2Y, infoMaxWidth);
                    } else {
                        ctx.fillText('DATA A CONFIRMAR', infoX, infoLine1Y, infoMaxWidth);
                        if (categoria) ctx.fillText(categoria, infoX, infoLine2Y, infoMaxWidth);
                    }

                    if (convocacao.rivalNome && convocacao.rivalNome.trim()) {
                        const casaNameGeral = (convocacao.casaNome || 'UBA FC').trim().toUpperCase();
                        const rivalNameGeral = convocacao.rivalNome.trim().toUpperCase();
                        const casaW = ctx.measureText(casaNameGeral).width;
                        const xLabelW = ctx.measureText('   X   ').width;

                        ctx.fillStyle = NAVY;
                        ctx.fillText(casaNameGeral, infoX, infoLine3Y, infoMaxWidth * 0.42);
                        ctx.fillStyle = RED_NEW;
                        ctx.textAlign = 'center';
                        ctx.fillText('X', infoX + casaW + (xLabelW / 2), infoLine3Y);
                        ctx.textAlign = 'left';
                        ctx.fillStyle = NAVY;
                        ctx.fillText(rivalNameGeral, infoX + casaW + xLabelW, infoLine3Y, infoMaxWidth - casaW - xLabelW);
                    }

                    // 3. BARRA "CONVOCADOS"
                    const barCenterY = canvasH * 0.5323;
                    ctx.font = `400 ${canvasH * 0.03}px "Anton", sans-serif`;
                    ctx.fillStyle = '#FFFFFF';
                    ctx.textAlign = 'center';
                    (ctx as any).letterSpacing = '2px';
                    ctx.fillText('CONVOCADOS', canvasW * 0.5, barCenterY);
                    (ctx as any).letterSpacing = '0px';
                    ctx.textAlign = 'left';

                    // 4. LISTA DE CONVOCADOS (duas colunas, ordem alfabética, nomes completos)
                    const allPlayers = [...titulares, ...reservas].sort((a, b) =>
                        (a.nome || '').trim().localeCompare((b.nome || '').trim(), 'pt-BR', { sensitivity: 'base' })
                    );
                    const totalPlayers = allPlayers.length;
                    const rows = Math.max(1, Math.ceil(totalPlayers / 2));
                    const listTop = canvasH * 0.60;
                    const listBottom = canvasH * 0.90;
                    const naturalPitch = (listBottom - listTop) / 7; // ritmo dos traços pontilhados da arte-base (8 linhas)
                    const rowPitch = rows > 1 ? Math.min(naturalPitch, (listBottom - listTop) / (rows - 1)) : 0;
                    const nameFontSize = Math.max(canvasH * 0.009, Math.min(canvasH * 0.0225, rowPitch > 0 ? rowPitch * 0.5 : canvasH * 0.0225));

                    const colLeftX = canvasW * 0.1016;
                    const colLeftMaxW = canvasW * 0.377;
                    const colRightX = canvasW * 0.551;
                    const colRightMaxW = canvasW * 0.363;

                    allPlayers.forEach((p, i) => {
                        const col = i < rows ? 0 : 1;
                        const row = i < rows ? i : i - rows;
                        const x = col === 0 ? colLeftX : colRightX;
                        const maxW = col === 0 ? colLeftMaxW : colRightMaxW;
                        const y = rows > 1 ? listTop + (row * rowPitch) : (listTop + listBottom) / 2;

                        const hasJerseyNumber = convocacao.showNumbers !== false && !!String(p.numero || '').trim();
                        let numberWidth = 0;

                        if (hasJerseyNumber) {
                            ctx.font = `900 ${nameFontSize}px "Montserrat", sans-serif`;
                            ctx.fillStyle = RED_NEW;
                            ctx.textAlign = 'left';
                            const numberLabel = `${String(p.numero).trim()}.`;
                            ctx.fillText(numberLabel, x, y);
                            numberWidth = ctx.measureText(numberLabel).width;
                        }

                        ctx.font = `700 ${nameFontSize}px "Montserrat", sans-serif`;
                        ctx.fillStyle = NAVY;
                        ctx.textAlign = 'left';
                        const nameGap = hasJerseyNumber ? canvasW * 0.012 : 0;
                        ctx.fillText((p.nome || '').trim(), x + numberWidth + nameGap, y, maxW - numberWidth - nameGap);
                    });
                } // Fim Geral

                resolve(canvas.toDataURL('image/png'));
            };

            img.onerror = () => {
                reject(new Error("Failed to load base image from /public"));
            };
        });
    }, []);

    const dataURLtoBlob = (dataurl: string) => {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)![1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    };

    const downloadImage = useCallback(async (convocacao: Convocacao, layout: 'geral' | 'individual' = 'geral', highlightUrl?: string) => {
        try {
            const dataUrl = await generateImage(convocacao, layout, highlightUrl);
            const blob = dataURLtoBlob(dataUrl);
            const blobUrl = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.download = `Convocacao-${layout}-${convocacao.jogo.replace(/\s+/g, '-')}.png`;
            link.href = blobUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Não revogamos imediatamente para garantir que o "Ver" (Preview) do iOS funcione
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000 * 60); // Revoga após 1 minuto

            return true;
        } catch (error) {
            console.error("Generator error:", error);
            return false;
        }
    }, [generateImage]);

    return { generateImage, downloadImage };
}
