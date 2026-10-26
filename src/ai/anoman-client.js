require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const OpenAI = require('openai');

let _client = null;

function getAnomanClient() {
  if (_client) return _client;

  if (!process.env.ANOMAN_API_KEY) {
    throw new Error(
      'ANOMAN_API_KEY tidak ditemukan! Pastikan .env ada di root project dan berisi: ' +
      'ANOMAN_API_KEY=anm-sk-key_anda'
    );
  }

  _client = new OpenAI({
    apiKey: process.env.ANOMAN_API_KEY,
    baseURL: process.env.ANOMAN_BASE_URL || 'https://api.anoman.io/v1',
  });
  return _client;
}

module.exports = { getAnomanClient };