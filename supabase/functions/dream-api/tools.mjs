import { tavilyProvider } from './tavily.mjs';
// Tool outputs are untrusted external content. Only the allowlisted server-side tool runs.
export const webSearchTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Busca hechos actuales cuando una respuesta depende de noticias, fechas, versiones o cambios recientes.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Consulta concreta de búsqueda' } }, required: ['query'], additionalProperties: false },
  },
};

export function collectToolCalls(chunks) {
  const calls = new Map();
  for (const chunk of chunks) {
    for (const delta of chunk?.choices?.[0]?.delta?.tool_calls || []) {
      if (!Number.isInteger(delta.index) || delta.index < 0 || delta.index > 3) continue;
      const prior = calls.get(delta.index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (delta.id) prior.id += delta.id;
      if (delta.function?.name) prior.function.name += delta.function.name;
      if (delta.function?.arguments) prior.function.arguments += delta.function.arguments;
      if (prior.function.arguments.length > 2048 || prior.function.name.length > 64 || prior.id.length > 128) throw new Error('oversized_tool_call');
      calls.set(delta.index, prior);
    }
  }
  return [...calls.values()];
}

export function validateToolCall(call) {
  if (call?.type !== 'function' || call?.function?.name !== 'web_search' || !/^[\w-]{1,128}$/.test(call.id || '')) throw new Error('invalid_tool_call');
  let args;
  try { args = JSON.parse(call.function.arguments); } catch { throw new Error('invalid_tool_arguments'); }
  if (!args || Array.isArray(args) || typeof args !== 'object' || Object.keys(args).some(key => key !== 'query') || typeof args.query !== 'string' || !args.query.trim() || args.query.length > 300) throw new Error('invalid_tool_arguments');
  return { id: call.id, query: args.query.trim() };
}

export const searchWeb = (query, options = {}) => tavilyProvider.search(query, options);
