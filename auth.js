const fs = require('fs').promises;
const path = require('path');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// Estos son los permisos que Jarvis usará: Drive y Gmail
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/gmail.modify'
];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

async function authorize() {
    // 1. Intentar cargar una llave guardada previamente
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        // 2. Si no existe, pedir permiso al usuario
        const client = await authenticate({
            scopes: SCOPES,
            keyfilePath: CREDENTIALS_PATH,
        });
        // 3. Guardar la llave para la próxima vez
        if (client.credentials) {
            const keys = JSON.parse(await fs.readFile(CREDENTIALS_PATH));
            const key = keys.installed || keys.web;
            const payload = JSON.stringify({
                type: 'authorized_user',
                client_id: key.client_id,
                client_secret: key.client_secret,
                refresh_token: client.credentials.refresh_token,
            });
            await fs.writeFile(TOKEN_PATH, payload);
        }
        return client;
    }
}

module.exports = { authorize };