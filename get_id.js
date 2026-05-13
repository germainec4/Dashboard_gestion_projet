import fs from 'fs';
const raw = fs.readFileSync('.env');
let content = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString('utf16le') : raw.toString('utf8');
const match = content.match(/SUPABASE_URL=https:\/\/(.*)\.supabase\.co/);
if (match) console.log(match[1]);
