// 1. Importar herramientas
require('dotenv').config();
const { listFiles } = require('./drive_tools');
const { authorize } = require('./auth');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 2. Configurar IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro-latest" });

let chatHistory = [
    {
        role: "user",
        parts: [{ text: "Eres Jarvis, el asistente personal de Franz. Eres culto y eficiente. Responde de forma concisa." }],
    },
    {
        role: "model",
        parts: [{ text: "Entendido, señor. Estoy operativo en su canal privado." }],
    }
];

// 3. Configurar WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('--- ESCANEA EL QR ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('¡Sistemas en línea! Jarvis está blindado, señor.');
});

// 6. El cerebro en acción con FILTRO DE AUTO-CHAT
client.on('message_create', async (msg) => {
    
    // FILTRO MAESTRO:
    // 1. Solo mensajes enviados por MÍ (fromMe)
    // 2. Solo si el destinatario es el mismo que el remitente (Chat contigo mismo)
    // 3. Que NO sea un grupo
    const esChatPropio = msg.to === msg.from;

    if (!msg.fromMe || !esChatPropio || msg.isGroup) return;

    const query = msg.body.toLowerCase();
    console.log(`[Jarvis]: Mensaje detectado en chat personal: ${msg.body}`);

    try {
        if (query.includes('lista mis archivos') || query.includes('drive')) {
            const lista = await listFiles();
            await msg.reply(lista);
            return;
        }

        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(msg.body);
        const response = await result.response;
        const text = response.text();

        chatHistory.push({ role: "user", parts: [{ text: msg.body }] });
        chatHistory.push({ role: "model", parts: [{ text: text }] });

        await msg.reply(text);

    } catch (error) {
        console.error('Error:', error);
    }
});

// 7. Inicio
async function iniciarAsistente() {
    try {
        console.log('Conectando con Google...');
        await authorize(); 
        console.log('✅ Google conectado.');
        client.initialize();
    } catch (error) {
        console.error('Error al iniciar:', error);
    }
}

iniciarAsistente();