const https = require('https');

https.get('https://openrouter.ai/api/v1/models', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const data = JSON.parse(body);
    console.log("Mistral models:", data.data.filter(m => m.id.includes('mistral-7b')).map(m => m.id));
    console.log("Llama 3 8B models:", data.data.filter(m => m.id.includes('llama-3') && m.id.includes('8b')).map(m => m.id));
    console.log("Gemini free:", data.data.filter(m => m.id.includes('gemini') && m.id.includes('free')).map(m => m.id));
  });
});
