import fs from 'fs';

async function testFinalAttempt() {
  const apiKey = 'TiSp8mFKFfhUZuIWtNKIM58IYKKPfvvE';
  
  const tests = [
    { url: 'https://api.malt.com/v1/external/freelance/invoices', headers: { 'X-Malt-Api-Key': apiKey } },
    { url: 'https://api.malt.com/v1/external/freelancer/invoices', headers: { 'X-Malt-Api-Key': apiKey } },
    { url: 'https://api.malt.com/v1/external/me', headers: { 'X-Malt-Api-Key': apiKey } },
    { url: 'https://api.malt.com/v1/freelance/me', headers: { 'X-Malt-Api-Key': apiKey } }
  ];

  for (const t of tests) {
    try {
      const response = await fetch(t.url, { headers: { ...t.headers, 'Accept': 'application/json' } });
      console.log(`[${response.status}] ${t.url}`);
      if (response.ok) {
         console.log("!!! ENFIN !!!");
         const data = await response.json();
         console.log(JSON.stringify(data, null, 2).substring(0, 500));
         process.exit(0);
      }
    } catch (e) {}
  }
}

testFinalAttempt();
