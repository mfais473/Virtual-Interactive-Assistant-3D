require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { GoogleGenAI } = require('@google/genai');

let _client = null;

function getGeminiClient() {
  if (_client) return _client;

  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY tidak ditemukan! Pastikan .env ada di root project dan berisi: ' +
      'GEMINI_API_KEY=key_anda'
    );
  }

  _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _client;
}

module.exports = { getGeminiClient };