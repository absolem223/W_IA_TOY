const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

const data = JSON.stringify({
  model: "meta-llama/llama-3.1-8b-instruct",
  messages: [{ role: "user", content: "hola" }]
});

const req = https.request('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.API_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', body));
});
req.on('error', console.error);
req.write(data);
req.end();
