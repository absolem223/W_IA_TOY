const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

function testModel(model) {
  const data = JSON.stringify({
    model: model,
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
    res.on('end', () => console.log(`[${model}] STATUS:`, res.statusCode));
  });
  req.on('error', console.error);
  req.write(data);
  req.end();
}

testModel('google/gemma-3-27b-it:free');
testModel('qwen/qwen3-coder:free');
testModel('liquid/lfm-2.5-1.2b-instruct:free');
