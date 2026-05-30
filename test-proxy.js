const fs = require('fs');
const envFile = fs.readFileSync('.env', 'utf-8');
const apiKey = envFile.match(/API_KEY=(.*)/)[1];

async function testModel(model) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: "hola" }],
    })
  });
  if (response.ok) {
    console.log(`[WORKING] ${model}`);
  }
}

async function run() {
  const r = await fetch('https://openrouter.ai/api/v1/models');
  const d = await r.json();
  const freeModels = d.data.filter(m => m.pricing.prompt === '0').map(m => m.id).slice(0, 30);
  
  for (const model of freeModels) {
    await testModel(model);
  }
}
run();
