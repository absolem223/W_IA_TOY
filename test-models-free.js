const https = require('https');

https.get('https://openrouter.ai/api/v1/models', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const data = JSON.parse(body);
    console.log("Free models:", data.data.filter(m => m.id.endsWith(':free')).map(m => m.id));
  });
});
