const dotenv = require('dotenv');
const result = dotenv.config();
console.log('Result:', result);
console.log('API_KEY is:', process.env.API_KEY);
