import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const SUPABASE_URL = 'https://vjlhyvfnyfdcwqxhvdrg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqbGh5dmZueWZkY3dxeGh2ZHJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTc3NDEsImV4cCI6MjA5Mzk5Mzc0MX0.-A0wdG6ItwZ6q3Hg51fx6znCwQHVUKfAl9xBQHq2qxk';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function cleanPrice(priceStr) {
  if (!priceStr) return 0;
  // Supprime tout sauf chiffres, virgule et point
  let cleaned = priceStr.toString().replace(/\s/g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2].trim()}-${parts[1].trim()}-${parts[0].trim()}`;
  }
  return null;
}

function parseCSV(text) {
  const result = [];
  let row = [];
  let cell = '';
  let inQuote = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i+1];
    
    if (char === '"' && inQuote && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuote = !inQuote;
    } else if (char === ',' && !inQuote) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuote) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell.trim());
      if (row.length > 1 || row[0] !== '') {
        result.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.trim());
    result.push(row);
  }
  return result;
}

async function run() {
  const buffer = fs.readFileSync('Suivi presta  - Datas Brutes.csv');
  const text = new TextDecoder('windows-1252').decode(buffer);
  
  const rows = parseCSV(text);
  const missions = [];
  
  // Skip header row
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (cols.length < 5) continue;
    
    const title = cols[0];
    if (!title || title.trim() === '') continue;
    
    const statusRaw = cols[1];
    const client = cols[2];
    const entity = cols[3];
    const contact = cols[4];
    const quoteSentRaw = cols[5];
    const quoteAcceptedRaw = cols[6];
    const priceRaw = cols[7];
    const deboursRaw = cols[8];
    const dateValRaw = cols[9];
    const datePayRaw = cols[10];
    const notesRaw = cols[14] || '';
    const payeRaw = cols[15] || '';
    
    let status = 'pas_commence';
    if (payeRaw.toUpperCase() === 'OK' || datePayRaw) {
      status = 'payee';
    } else if (statusRaw.toUpperCase().includes('TERMIN')) {
      status = 'terminee';
    } else if (statusRaw.toUpperCase().includes('EN COURS')) {
      status = 'en_cours';
    } else if (statusRaw.toUpperCase().includes('BLOQU')) {
      status = 'bloque';
    }
    
    missions.push({
      title: title,
      client: client,
      entity: entity,
      contact: contact,
      quote_sent: (quoteSentRaw && quoteSentRaw.toUpperCase() === 'TRUE'),
      quote_accepted: (quoteAcceptedRaw && quoteAcceptedRaw.toUpperCase() === 'TRUE'),
      price: cleanPrice(priceRaw),
      debours: cleanPrice(deboursRaw),
      date_validation: parseDate(dateValRaw),
      date_payment: parseDate(datePayRaw),
      status: status,
      notes: notesRaw,
      user_id: '8baf3a41-a6ce-49f3-95f8-6564bab22ec3'
    });
  }
  
  console.log(`Prepared ${missions.length} missions for insertion.`);
  console.log(`Prepared ${missions.length} missions.`);
  let sql = "INSERT INTO public.missions (title, client, entity, contact, quote_sent, quote_accepted, price, debours, date_validation, date_payment, status, notes, user_id) VALUES\n";
  
  const valueRows = missions.map(m => {
    return `('${m.title.replace(/'/g, "''")}', '${m.client.replace(/'/g, "''")}', '${m.entity.replace(/'/g, "''")}', '${m.contact.replace(/'/g, "''")}', ${m.quote_sent}, ${m.quote_accepted}, ${m.price}, ${m.debours}, ${m.date_validation ? `'${m.date_validation}'` : 'NULL'}, ${m.date_payment ? `'${m.date_payment}'` : 'NULL'}, '${m.status}', '${m.notes.replace(/'/g, "''")}', '${m.user_id}')`;
  });
  
  sql += valueRows.join(",\n") + ";";
  
  fs.writeFileSync('insert_missions_v2.sql', sql);
  console.log(`SQL file 'insert_missions_v2.sql' generated successfully.`);
}

run();
