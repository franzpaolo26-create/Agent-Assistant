require('dotenv').config();

async function escanearModelos() {
    console.log('Buscando modelos autorizados para tu cuenta...');
    
    try {
        const respuesta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const datos = await respuesta.json();
        
        if (datos.error) {
            console.error('Error de Google:', datos.error.message);
            return;
        }

        const nombresModelos = datos.models
            // Filtramos para ver solo los modelos que generan contenido
            .filter(m => m.supportedGenerationMethods.includes('generateContent'))
            .map(m => m.name.replace('models/', '')); // Limpiamos el nombre
            
        console.log('\n--- MODELOS DISPONIBLES ---');
        console.log(nombresModelos);
        console.log('---------------------------\n');
    } catch (error) {
        console.error('Error de conexión:', error);
    }
}

escanearModelos();