require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { getGeminiClient } = require('./gemini-client');
const { getAnomanClient } = require('./anoman-client');

const PROVIDER = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();

if (PROVIDER !== 'gemini' && PROVIDER !== 'anoman') {
  throw new Error(`LLM_PROVIDER tidak valid: "${PROVIDER}". Gunakan 'gemini' atau 'anoman'.`);
}

const DEFAULT_MODEL = {
  gemini: {
    primary: process.env.GEMINI_MODEL_PRIMARY || 'gemini-2.0-flash-lite',
    followUp: process.env.GEMINI_MODEL_FOLLOWUP || 'gemini-2.0-flash',
    coding: process.env.GEMINI_MODEL_CODING || process.env.GEMINI_MODEL_FOLLOWUP || 'gemini-2.0-flash',
  },
  anoman: {
    primary: process.env.ANOMAN_MODEL_PRIMARY || 'gpt-4o-mini',
    followUp: process.env.ANOMAN_MODEL_FOLLOWUP || 'gpt-4o-mini',
    coding: process.env.ANOMAN_MODEL_CODING || process.env.ANOMAN_MODEL_FOLLOWUP || 'gpt-4o-mini',
  },
};

console.log(
  `[llm-client] provider=${PROVIDER} ` +
  `primary=${DEFAULT_MODEL[PROVIDER].primary} followUp=${DEFAULT_MODEL[PROVIDER].followUp} ` +
  `coding=${DEFAULT_MODEL[PROVIDER].coding}`
);

/*
 * Format pesan netral (provider-agnostic) yang dipakai agent-loop:
 *   { role:'user', text, images?:[{mimeType,data}] }
 *   { role:'assistant', text, toolCalls?:[{id,name,args}], rawGemini? }
 *   { role:'tool', toolCallId, name, text }
 */

function toOpenAIMessages(system, messages) {
  const out = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') {
      if (m.images && m.images.length) {
        out.push({
          role: 'user',
          content: [
            { type: 'text', text: m.text || '' },
            ...m.images.map((img) => ({
              type: 'image_url',
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
          ],
        });
      } else {
        out.push({ role: 'user', content: m.text || '' });
      }
    } else if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: m.text || (m.toolCalls?.length ? null : '') };
      if (m.toolCalls && m.toolCalls.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args || {}) },
        }));
      }
      out.push(msg);
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.text || '' });
    }
  }
  return out;
}

async function callAnoman({ system, messages, tools, model }) {
  const client = getAnomanClient();
  const body = { model, messages: toOpenAIMessages(system, messages) };
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }

  const resp = await client.chat.completions.create(body);
  const msg = resp.choices?.[0]?.message || {};

  let text = msg.content || '';
  if (Array.isArray(text)) text = text.map((p) => p.text || '').join('');

  const toolCalls = (msg.tool_calls || [])
    .filter((tc) => tc.function)
    .map((tc, i) => {
      let args = {};
      let argsError;
      try {
        args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        argsError = 'Argumen tool bukan JSON yang valid';
      }
      return { id: tc.id || `call_${Date.now()}_${i}`, name: tc.function.name, args, argsError };
    });

  return { text, toolCalls };
}

function toGeminiContents(messages) {
  const contents = [];
  // Gabungkan pesan berurutan ber-role sama (mis. functionResponse + gambar).
  const push = (role, parts) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts: [...parts] });
  };

  for (const m of messages) {
    if (m.role === 'user') {
      const parts = [];
      if (m.text) parts.push({ text: m.text });
      for (const img of m.images || []) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
      push('user', parts);
    } else if (m.role === 'assistant') {
      if (m.rawGemini && m.rawGemini.length) {
        // pakai bagian asli agar thought signature (model "thinking") ikut terbawa
        push('model', m.rawGemini);
      } else {
        const parts = [];
        if (m.text) parts.push({ text: m.text });
        for (const c of m.toolCalls || []) {
          parts.push({ functionCall: { name: c.name, args: c.args || {} } });
        }
        push('model', parts);
      }
    } else if (m.role === 'tool') {
      push('user', [{ functionResponse: { name: m.name, response: { result: m.text || '' } } }]);
    }
  }
  return contents;
}

function toGeminiDeclaration(t) {
  const props = {};
  for (const [k, v] of Object.entries(t.parameters?.properties || {})) {
    props[k] = { type: String(v.type || 'string').toUpperCase(), description: v.description || '' };
  }
  const decl = { name: t.name, description: t.description };
  if (Object.keys(props).length) {
    decl.parameters = { type: 'OBJECT', properties: props, required: t.parameters.required || [] };
  }
  return decl;
}

async function callGemini({ system, messages, tools, model }) {
  const client = getGeminiClient();
  const config = { systemInstruction: system };
  if (tools.length) config.tools = [{ functionDeclarations: tools.map(toGeminiDeclaration) }];

  const response = await client.models.generateContent({
    model,
    contents: toGeminiContents(messages),
    config,
  });

  const parts = response.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: p.functionCall.id || `call_${Date.now()}_${i}`,
      name: p.functionCall.name,
      args: p.functionCall.args || {},
    }));

  return { text, toolCalls, rawGemini: toolCalls.length ? parts : undefined };
}

/**
 * @param {object} opts
 * @param {string} opts.system
 * @param {Array}  opts.messages  format pesan netral (lihat atas)
 * @param {Array}  [opts.tools]   hasil tools.getToolSchemas()
 * @param {'primary'|'followUp'|'coding'} [opts.phase]
 * @returns {Promise<{text:string, toolCalls:Array, rawGemini?:Array}>}
 */
async function callLLM({ system, messages, tools = [], phase = 'primary' }) {
  const model = DEFAULT_MODEL[PROVIDER][phase] || DEFAULT_MODEL[PROVIDER].primary;
  const fn = PROVIDER === 'anoman' ? callAnoman : callGemini;
  return fn({ system, messages, tools, model });
}

module.exports = { callLLM, __test: { toOpenAIMessages, toGeminiContents, toGeminiDeclaration } };
