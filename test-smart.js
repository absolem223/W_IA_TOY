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
      'Content-Length': Buffer.byteLength(data)
    }
  }, (res) => {
    console.log(`[${model}] STATUS:`, res.statusCode);
  });
  req.on('error', console.error);
  req.write(data);
  req.end();
}

testModel('google/gemma-3-12b-it:free');
testModel('nvidia/nemotron-nano-9b-v2:free');
testModel('z-ai/glm-4.5-air:free');
testModel('cognitivecomputations/dolphin-mistral-24b-venice-edition:free');
