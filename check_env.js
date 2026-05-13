import fs from 'fs';
const raw = fs.readFileSync('.env');
let content = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8');
const lines = content.split('\n');
const maltLine = lines.find(l => l.includes('MALT_API_KEY'));
if (maltLine) {
    console.log(`Ligne complète: [${maltLine.trim()}]`);
    console.log(`Longueur de la valeur: ${maltLine.split('=')[1]?.trim().length}`);
} else {
    console.log("MALT_API_KEY non trouvée");
}
