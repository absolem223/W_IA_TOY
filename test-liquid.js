const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const data = JSON.stringify({
  model: "liquid/lfm-2.5-1.2b-instruct:free",
  messages: [
    { role: "system", content: "Sos un asistente inteligente y amigable. Respondé solo en español." },
    { role: "user", content: "hola" }
  ]
});

const req = https.request('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.API_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('BODY:', body));
});
req.on('error', console.error);
req.write(data);
req.end();
