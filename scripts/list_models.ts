import https from 'https';

https.get('https://openrouter.ai/api/v1/models', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const models = JSON.parse(data).data;
    const freeModels = models.filter((m: any) => m.id.includes('free'));
    console.log("Free models:", freeModels.map((m:any) => m.id));
  });
});
