import { doc, getDoc, collection, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export const WHATSAPP_SERVICE_URL =
    (import.meta.env.VITE_WHATSAPP_URL as string) || 'https://evolution-api-im3d.onrender.com';

export const WORKER_URL = 
    (import.meta.env.VITE_WORKER_URL as string) || 'https://uba-whatsapp-proxy.thayrufino2.workers.dev';

const GLOBAL_API_KEY = (import.meta.env.VITE_WHATSAPP_API_KEY as string) || '';
export const INSTANCE_NAME = 'uba_instance';

export const TEST_PHONE = '5533998200546';

function isUsableApiKey(key?: string) {
    const normalizedKey = (key || '').trim();
    return normalizedKey.length >= 20 && !normalizedKey.includes('*') && !normalizedKey.includes('•') && normalizedKey !== 'worker-managed';
}

export function resolveWhatsAppApiKey(apiKey?: string) {
    const normalizedKey = (apiKey || '').trim();
    return GLOBAL_API_KEY || (isUsableApiKey(normalizedKey) ? normalizedKey : '');
}

export interface WhatsAppFullConfig {
    apiKey: string;
    senderPhone: string;
    testPhone: string;
    modoTeste: boolean;
    imageUrl?: string;
    pendingImageUrl?: string;
    // Automação de Aniversário
    birthdayAutomationEnabled?: boolean;
    birthdaySendTime?: string;
    birthdayTemplateText?: string;
    birthdayDefaultImage?: string;
    birthdayAutomationTestMode?: boolean;
}

/**
 * Carrega a configuração do WhatsApp do Firestore.
 */
export async function loadWhatsAppConfig(): Promise<WhatsAppFullConfig | null> {
    try {
        const snap = await getDoc(doc(db, 'system_settings', 'whatsapp'));
        if (!snap.exists()) {
            return GLOBAL_API_KEY ? {
                apiKey: GLOBAL_API_KEY,
                senderPhone: '',
                testPhone: TEST_PHONE,
                modoTeste: false,
                imageUrl: '',
                pendingImageUrl: '',
                birthdayAutomationEnabled: false,
                birthdaySendTime: '09:00',
                birthdayTemplateText: '',
                birthdayDefaultImage: '',
                birthdayAutomationTestMode: false,
            } : null;
        }
        const d = snap.data();
        return {
            apiKey: resolveWhatsAppApiKey(d.apiKey),
            senderPhone: d.senderPhone || '',
            testPhone: d.testPhone || TEST_PHONE,
            modoTeste: d.modoTeste === true,
            imageUrl: d.imageUrl || '',
            pendingImageUrl: d.pendingImageUrl || '',
            birthdayAutomationEnabled: d.birthdayAutomationEnabled === true,
            birthdaySendTime: d.birthdaySendTime || '09:00',
            birthdayTemplateText: d.birthdayTemplateText || '',
            birthdayDefaultImage: d.birthdayDefaultImage || '',
            birthdayAutomationTestMode: d.birthdayAutomationTestMode === true,
        };
    } catch {
        return null;
    }
}

/**
 * Garante que a instância existe na Evolution API.
 */
export async function ensureInstance(apiKey: string) {
    if (!apiKey) return false;
    try {
        const check = await fetch(`${WHATSAPP_SERVICE_URL}/instance/connectionState/${INSTANCE_NAME}`, {
            headers: { 
                'apikey': apiKey,
                'ApiKey': apiKey // Fallback para sensibilidade a maiúsculas
            }
        });
        
        if (check.ok) return true;

        // Se retornar 404, vamos criar
        const res = await fetch(`${WHATSAPP_SERVICE_URL}/instance/create`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'apikey': apiKey,
                'ApiKey': apiKey
            },
            body: JSON.stringify({
                instanceName: INSTANCE_NAME,
                token: apiKey, // Usamos a global como token da instância para simplificar
                qrcode: true,
                integration: 'WHATSAPP-BAILEYS'
            })
        });

        const json = await res.json();
        if (res.ok || res.status === 201) return true;
        
        console.error('Falha ao criar instância:', json);
        return false;
    } catch (e) {
        console.error('Erro ao garantir instância:', e);
        return false;
    }
}

/**
 * Helper para carregar imagem e converter para ImageBitmap ou HTMLImageElement
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        // Se for local path, adiciona o origin
        const finalUrl = url.startsWith('/') ? window.location.origin + url : url;
        // Adiciona cache buster se for URL externa para evitar problemas de cache/CORS
        img.src = finalUrl.startsWith('http') ? `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}t=${Date.now()}` : finalUrl;
    });
}

/**
 * Sobrepõe a foto do aluno na imagem base (canto inferior esquerdo).
 */
export async function getOverlayedImage(baseImageUrl: string, studentPhotoUrl: string): Promise<{ base64: string, mimeType: string }> {
    console.log('Starting image overlay process...');
    console.log('Base Image:', baseImageUrl.substring(0, 50) + '...');
    console.log('Student Photo:', studentPhotoUrl);

    try {
        const [baseImg, studentImg] = await Promise.all([
            loadImage(baseImageUrl),
            loadImage(studentPhotoUrl).catch(err => {
                console.warn('Student photo failed to load, proceeding with base only:', err);
                return null;
            })
        ]);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context not available');

        // Tamanho do canvas baseado na imagem base
        const MAX_W = 1000;
        let w = baseImg.width;
        let h = baseImg.height;
        if (w > MAX_W) {
            h = (MAX_W / w) * h;
            w = MAX_W;
        }
        canvas.width = w;
        canvas.height = h;

        // 1. Desenha o fundo
        ctx.drawImage(baseImg, 0, 0, w, h);

        // 2. Desenha a foto do aluno se carregou
        if (studentImg) {
            const studentSize = Math.floor(Math.min(w, h) * 0.28);
            const margin = Math.floor(w * 0.04);
            const x = margin;
            const y = h - studentSize - margin;

            // Sombra/Borda suave
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 5;

            // Borda branca
            ctx.fillStyle = '#ffffff';
            const border = 4;
            
            // Desenhar retângulo arredondado para a moldura
            const radius = 12;
            ctx.beginPath();
            ctx.moveTo(x - border + radius, y - border);
            ctx.lineTo(x + studentSize + border - radius, y - border);
            ctx.quadraticCurveTo(x + studentSize + border, y - border, x + studentSize + border, y - border + radius);
            ctx.lineTo(x + studentSize + border, y + studentSize + border - radius);
            ctx.quadraticCurveTo(x + studentSize + border, y + studentSize + border, x + studentSize + border - radius, y + studentSize + border);
            ctx.lineTo(x - border + radius, y + studentSize + border);
            ctx.quadraticCurveTo(x - border, y + studentSize + border, x - border, y + studentSize + border - radius);
            ctx.lineTo(x - border, y - border + radius);
            ctx.quadraticCurveTo(x - border, y - border, x - border + radius, y - border);
            ctx.closePath();
            ctx.fill();

            // Reset shadow para a imagem
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Desenhar a foto com clip
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + studentSize - radius, y);
            ctx.quadraticCurveTo(x + studentSize, y, x + studentSize, y + radius);
            ctx.lineTo(x + studentSize, y + studentSize - radius);
            ctx.quadraticCurveTo(x + studentSize, y + studentSize, x + studentSize - radius, y + studentSize);
            ctx.lineTo(x + radius, y + studentSize);
            ctx.quadraticCurveTo(x, y + studentSize, x, y + studentSize - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.clip();

            // Ajuste de proporção da foto do aluno (cover)
            const sW = studentImg.width;
            const sH = studentImg.height;
            const aspect = sW / sH;
            
            if (aspect > 1) { // Paisagem
                const drawW = studentSize * aspect;
                ctx.drawImage(studentImg, x - (drawW - studentSize) / 2, y, drawW, studentSize);
            } else { // Retrato ou Quadrado
                const drawH = studentSize / aspect;
                ctx.drawImage(studentImg, x, y - (drawH - studentSize) / 2, studentSize, drawH);
            }
            ctx.restore();
            console.log('Student photo overlaid successfully.');
        }

        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        return {
            base64: base64.split(',')[1],
            mimeType: 'image/jpeg'
        };
    } catch (err) {
        console.error('Overlay failed:', err);
        throw err;
    }
}

export interface BatchProgress {
    current: number;
    total: number;
    currentName: string;
    currentPhone: string;
    currentPhotoUrl?: string;
    status: 'processing' | 'success' | 'error';
    log: string;
    results: { name: string; phone: string; success: boolean; log: string; photoUrl?: string }[];
}

/**
 * Envia mensagens em lote para a fila do Worker (Backend).
 */
export async function sendWhatsAppBatch(
    messages: { id: string; phone: string; text: string; imageUrl?: string; studentPhotoUrl?: string; name?: string; photoUrl?: string }[],
    onProgress?: (progress: BatchProgress) => void
): Promise<{ success: boolean; queued: number }> {
    try {
        // Notifica que está enfileirando
        onProgress?.({
            current: 0,
            total: messages.length,
            currentName: 'Enfileirando mensagens...',
            currentPhone: '',
            status: 'processing',
            log: 'Enviando lote para o servidor...',
            results: []
        });

        const res = await fetch(`${WORKER_URL}/queue/enqueue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages })
        });

        if (!res.ok) throw new Error('Falha ao enfileirar mensagens');
        
        const json = await res.json();

        // Notifica sucesso no enfileiramento
        onProgress?.({
            current: messages.length,
            total: messages.length,
            currentName: 'Lote enviado com sucesso!',
            currentPhone: '',
            status: 'success',
            log: `Lote enfileirado no backend (ID: ${json.batchId}). O processamento iniciará em instantes.`,
            results: messages.map(m => ({
                name: m.name || m.phone,
                phone: m.phone,
                success: true,
                log: 'Na fila de espera',
                photoUrl: m.photoUrl
            }))
        });

        return { success: true, queued: messages.length };
    } catch (err: any) {
        console.error('Erro ao enfileirar lote:', err);
        return { success: false, queued: 0 };
    }
}

export async function sendWhatsApp(
    phone: string,
    text: string,
    config: WhatsAppFullConfig,
    forceTest: boolean = false,
    overrideImageUrl?: string,
    studentPhotoUrl?: string,
    alunoNome?: string,
    alunoFotoUrl?: string
): Promise<{ success: boolean; log: string }> {
    const toTest = config.modoTeste || forceTest;
    
    // Sanitização rigorosa: apenas números
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanTestPhone = (config.testPhone || TEST_PHONE).replace(/\D/g, '');
    
    const destino = toTest ? cleanTestPhone : cleanPhone;
    const textoFinal = toTest
        ? `🧪 *[MODO TESTE]*\n_Destinatário original: ${phone}_\n\n${text}`
        : text;

    const key = resolveWhatsAppApiKey(config.apiKey);
    if (!key) return { success: false, log: 'API Key não configurada.' };

    try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 10000);
        const statusRes = await fetch(`${WHATSAPP_SERVICE_URL}/instance/connectionState/${INSTANCE_NAME}`, {
            headers: {
                'apikey': key,
                'ApiKey': key
            },
            signal: controller.signal
        });
        window.clearTimeout(timeoutId);

        if (!statusRes.ok) {
            return { success: false, log: `NÃ£o foi possÃ­vel verificar a conexÃ£o do WhatsApp (HTTP ${statusRes.status}).` };
        }

        const statusJson = await statusRes.json();
        const instanceState = statusJson.instance?.state || statusJson.state || 'desconhecido';
        if (instanceState !== 'open') {
            return { success: false, log: `WhatsApp nÃ£o conectado (${instanceState}). Reabra o painel e escaneie/confirme o QR Code antes de enviar.` };
        }
    } catch (error: any) {
        return { success: false, log: `NÃ£o foi possÃ­vel confirmar a conexÃ£o do WhatsApp: ${error.message || 'erro desconhecido'}.` };
    }

    const rawUrl = overrideImageUrl !== undefined ? overrideImageUrl : (config.imageUrl || '');
    const hasMedia = !!rawUrl && rawUrl.trim().length > 0;
    const endpoint = hasMedia ? 'sendMedia' : 'sendText';
    
    let mediaContent = '';
    let mimeType = 'image/png';

    if (hasMedia) {
        if (studentPhotoUrl) {
            try {
                // Se tem foto do aluno, fazemos a sobreposição
                const overlayRes = await getOverlayedImage(rawUrl, studentPhotoUrl);
                mediaContent = overlayRes.base64;
                mimeType = overlayRes.mimeType;
            } catch (err) {
                console.error('Erro na sobreposição, enviando original:', err);
                // Fallback para envio normal se falhar
                const fallback = await convertToMedia(rawUrl);
                mediaContent = fallback.content;
                mimeType = fallback.mimeType;
            }
        } else {
            const result = await convertToMedia(rawUrl);
            mediaContent = result.content;
            mimeType = result.mimeType;
        }
    }

    console.log(`WhatsApp send triggered. Media: ${hasMedia ? 'YES' : 'NO'}, URL/Path: ${rawUrl}`);

    try {
        const payload: any = {
            number: destino,
            delay: 1200,
        };

        if (hasMedia && mediaContent) {
            payload.media = mediaContent;
            payload.mediatype = 'image';
            payload.mediaType = 'image';
            payload.mimetype = mimeType;
            payload.caption = textoFinal;
            payload.mediaName = 'cobranca.png';
        } else {
            payload.text = textoFinal;
            payload.linkPreview = true;
        }

        const res = await fetch(`${WHATSAPP_SERVICE_URL}/message/${endpoint}/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key,
                'ApiKey': key
            },
            body: JSON.stringify(payload)
        });
        
        // Usa text() primeiro para evitar crash quando a API retorna HTML de erro (ex: 401)
        const rawText = await res.text();
        let json: any = {};
        try {
            json = JSON.parse(rawText);
        } catch {
            json = { error: `Resposta não-JSON (HTTP ${res.status}): ${rawText.substring(0, 100)}` };
        }
        
        // res.ok = status 2xx (inclui 201 da Evolution API)
        // Não dependemos do body JSON pois a API pode retornar binário/protobuf no sucesso
        if (res.ok) {
            // Salvar no histórico
            await addDoc(collection(db, 'whatsapp_logs'), {
                destinatario: destino,
                mensagem: textoFinal,
                status: 'SUCESSO',
                dataHora: new Date().toISOString(),
                tipo: hasMedia ? 'MEDIA' : 'TEXTO',
                ...(alunoNome && { alunoNome }),
                ...(alunoFotoUrl && { alunoFotoUrl })
            });
            return { success: true, log: config.modoTeste ? `✓ Enviado (teste)` : 'Enviado' };
        } else {
            const erroMsg = json.message || json.error || `Erro HTTP ${res.status}`;
            const readableError = Array.isArray(erroMsg)
                ? erroMsg.join(' | ')
                : typeof erroMsg === 'object'
                    ? JSON.stringify(erroMsg)
                    : erroMsg;
            // Salvar erro
            await addDoc(collection(db, 'whatsapp_logs'), {
                destinatario: destino,
                mensagem: textoFinal,
                status: 'ERRO',
                erro: readableError,
                dataHora: new Date().toISOString(),
                tipo: hasMedia ? 'MEDIA' : 'TEXTO',
                ...(alunoNome && { alunoNome }),
                ...(alunoFotoUrl && { alunoFotoUrl })
            });
            return { success: false, log: readableError };
        }
    } catch (e: any) {
        // Log Falha
        await addDoc(collection(db, 'whatsapp_logs'), {
            destinatario: destino,
            mensagem: textoFinal,
            status: 'ERRO',
            erro: e.message,
            dataHora: new Date().toISOString(),
            tipo: hasMedia ? 'MEDIA' : 'TEXTO'
        });
        return { success: false, log: e.message };
    }
}

/**
 * Salva as configurações do WhatsApp no Firestore.
 */
export async function saveWhatsAppConfig(config: Partial<WhatsAppFullConfig>): Promise<boolean> {
    try {
        await updateDoc(doc(db, 'system_settings', 'whatsapp'), config);
        return true;
    } catch (e) {
        console.error('Erro ao salvar config WhatsApp:', e);
        return false;
    }
}

/**
 * Helper para converter URL em Base64
 */
async function convertToMedia(url: string): Promise<{ content: string, mimeType: string }> {
    if (url.startsWith('data:image')) {
        const parts = url.split(',');
        return { content: parts[1], mimeType: parts[0].split(':')[1].split(';')[0] };
    }
    
    try {
        const fetchRes = await fetch(url.startsWith('/') ? window.location.origin + url : url);
        const blob = await fetchRes.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        return { content: base64.split(',')[1], mimeType: blob.type || 'image/png' };
    } catch {
        return { content: '', mimeType: 'image/png' };
    }
}

