// 1. Importar herramientas
require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// 2. Configurar el "Cuerpo" de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Cámbialo a false si quieres ver la ventana del navegador abrirse y fallar
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-extensions',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        // Esto hace que WhatsApp crea que eres un Chrome normal en Windows
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
});

// 3. Mostrar el código QR en la pantalla
client.on('qr', (qr) => {
    console.log('--- ESCANEA ESTO CON TU IPHONE ---');
    qrcode.generate(qr, { small: true });
});

// 4. Confirmar que estamos dentro
client.on('ready', () => {
    console.log('¡Sistemas en línea! Jarvis está listo para servirle, señor.');
});

// 5. Escuchar y responder mensajes
client.on('message', async (msg) => {
    // Solo responderte a ti por seguridad
    if (msg.from !== process.env.OWNER_NUMBER) return;

    console.log('Mensaje recibido:', msg.body);

    if (msg.body.toLowerCase() === 'hola') {
        msg.reply('Hola señor, estoy configurado correctamente. ¿En qué puedo ayudarle?');
    }
});

// 6. Arrancar el proceso
client.initialize();