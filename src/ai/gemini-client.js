require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

if (!process.env.GEMINI_API_KEY) {
  console.error(
    'GEMINI_API_KEY tidak ditemukan! Pastikan file .env ada di folder yang ' +
    'SAMA dengan package.json/main.js ini, dan berisi baris: GEMINI_API_KEY=key_anda'
  );
}

const genAI = new GoogleGenAI({ vertexai: false, apiKey: process.env.GEMINI_API_KEY });

module.exports = { genAI };