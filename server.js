// Server locale per provare la bacheca sul proprio computer.
// Dati, accessi e permessi sono gestiti da Supabase: online basta un hosting di siti statici per la cartella "public".

const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.listen(PORT, () => console.log(`Bacheca in ascolto su http://localhost:${PORT}`));
