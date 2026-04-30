const { google } = require('googleapis');
const { authorize } = require('./auth');

async function listFiles() {
    const auth = await authorize();
    const drive = google.drive({ version: 'v3', auth });
    
    try {
        const res = await drive.files.list({
            pageSize: 10,
            fields: 'nextPageToken, files(id, name, mimeType)',
            orderBy: 'modifiedTime desc'
        });
        
        const files = res.data.files;
        if (files.length === 0) return 'No se encontraron archivos en su unidad de Drive, señor.';

        let output = 'Sus archivos más recientes en Drive son:\n\n';
        files.forEach((file) => {
            output += `📄 *${file.name}* (ID: ${file.id})\n`;
        });
        return output;
    } catch (err) {
        return 'Lo lamento, señor, hubo un error al acceder a Drive: ' + err.message;
    }
}

module.exports = { listFiles };