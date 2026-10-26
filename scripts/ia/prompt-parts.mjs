// Imprime en JSON cada parte del prompt de sistema tal como la monta dream-api,
// para medirla con el tokenizador real (scripts/ia/medir-tokens.py).
import {
  COMMON_RULES, CONVERSATION_POLICY, DREAM_SYSTEM_PROMPT, MODE_SYSTEM_PROMPTS, NO_INVENT_LAYER,
  SEARCH_TOOL_PROMPT, TONE_LAYER, chatSystemMessages, dynamicContextFor, searchAnswerMessages, searchPlannerMessages,
} from '../../supabase/functions/dream-api/prompts.mjs';
import { selfKnowledge } from '../../supabase/functions/dream-api/features.mjs';
import { webSearchTool } from '../../supabase/functions/dream-api/tools.mjs';

const personal = '- Cuando te dirijas al alumno por su nombre, escribe exactamente {{APODO}} (Dream lo cambia por el nombre que eligió). No lo uses en cada frase.\n- Le gusta: fútbol, música. Úsalo solo si ayuda a poner un ejemplo; no lo menciones por mencionarlo.';
const join = (messages) => messages.map((m) => m.content).join('\n\n');
console.log(JSON.stringify({
  parts: {
    COMMON_RULES, DREAM_SYSTEM_PROMPT, TONE_LAYER, NO_INVENT_LAYER,
    SELF_KNOWLEDGE: selfKnowledge(), SELF_KNOWLEDGE_WITH_MEMORY: selfKnowledge({ memory: true }),
    CONVERSATION_POLICY, SEARCH_TOOL_PROMPT, DYNAMIC_CONTEXT: dynamicContextFor([], null, personal),
    WEB_SEARCH_TOOL: JSON.stringify(webSearchTool),
  },
  totals: {
    'sistema Normal (sin búsqueda)': join(chatSystemMessages('normal', { personal })),
    'sistema Normal (con herramienta)': join(chatSystemMessages('normal', { personal, search: true })) + JSON.stringify(webSearchTool),
    'sistema Rápido': join(chatSystemMessages('fast', { personal, search: true })) + JSON.stringify(webSearchTool),
    'sistema Pensar más': join(chatSystemMessages('think', { personal })),
    'búsqueda: planificador': join(searchPlannerMessages()) + JSON.stringify(webSearchTool),
    'búsqueda: respuesta': join(searchAnswerMessages({ personal })),
    'modo Normal (solo el prompt fijo)': MODE_SYSTEM_PROMPTS.normal,
  },
}));
