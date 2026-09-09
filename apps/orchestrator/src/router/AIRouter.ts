interface AIProvider { name: string; baseURL: string; apiKey: string; models: string[] }

const providers: Record<string, AIProvider> = {
  qwen: { name: "Qwen-Max", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", apiKey: process.env.DASHSCOPE_API_KEY || "", models: ["qwen-max-latest"] },
  groq: { 
    name: "Groq", 
    baseURL: "https://api.groq.com/openai/v1", 
    apiKey: process.env.GROQ_API_KEY || "", 
    models: [
      "groq/compound-mini",
      "groq/compound",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "qwen/qwen3.6-27b"
    ]  
  },
  gemini: { name: "Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: process.env.GEMINI_API_KEY || "", models: ["gemini-1.5-flash"] },
  openrouter: { name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY || "", models: ["meta-llama/llama-3.3-70b-instruct:free"] },
};

export type TaskType = "COMMENT_CLASSIFY" | "PRODUCT_PITCH" | "FAQ_REASONING" | "POLICY_REWRITE" | "CHITCHAT" | "SONG_EXTRACT";

interface Route { provider: AIProvider; temperature: number; maxTokens: number }

const ROUTING_TABLE: Record<TaskType, Route> = {
  COMMENT_CLASSIFY: { provider: providers.groq, temperature: 0.3, maxTokens: 256 },
  CHITCHAT: { provider: providers.groq, temperature: 0.7, maxTokens: 256 },
  PRODUCT_PITCH: { provider: providers.groq, temperature: 0.8, maxTokens: 1024 },
  FAQ_REASONING: { provider: providers.groq, temperature: 0.6, maxTokens: 2048 },
  POLICY_REWRITE: { provider: providers.groq, temperature: 0.5, maxTokens: 1024 },
  SONG_EXTRACT: { provider: providers.groq, temperature: 0.2, maxTokens: 64 },
};

let workingGroqModel: string | null = null;

async function callProvider(p: AIProvider, model: string, messages: any[], temperature: number, maxTokens: number) {
  const start = Date.now();
  const body: any = { model, messages, temperature, max_tokens: maxTokens };
  const res = await fetch(p.baseURL + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(p.name + " error " + res.status + ": " + errText.slice(0, 100));
  }
  const data: any = await res.json();
  let content = data.choices?.[0]?.message?.content || "";
  content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return { content, latencyMs: Date.now() - start, model };
}

const MS_RE = /\b(tak|takde|nak|kat|dah|boleh|berapa|pukul|harga|stok|korang|kita|aku|awak|jom|sebab|kenapa|macam|betul|cantik|murah|mahal|beli|malam|esok|tadi|selalu|bila|mana|apa|siapa|assalamualaikum|waalaikumussalam|khabar|santai|borak|kongsi|cerita|sokong|tengok|jumpa|sayang|weh|bang|kak|takpe|je|lah|pun|ni|tu)\b/i;
export function detectLang(text: string): "MS" | "EN" {
  return MS_RE.test(text) ? "MS" : "EN";
}

function demoContent(task: TaskType, messages: any[]): string {
  const userMsg = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const lang = detectLang(userMsg);
  const isEn = lang === "EN";
  
  switch (task) {
    case "COMMENT_CLASSIFY":
      if (/harga|berapa|stok|stock|beli|price/.test(userMsg)) return '{ "intent": "QUESTION", "sentiment": "NEUTRAL", "confidence":0.9}';
      return '{ "intent": "CHITCHAT", "sentiment": "POSITIVE", "confidence":0.8}';
    case "SONG_EXTRACT":
      return "NONE";
    case "FAQ_REASONING":
      return isEn
        ? "Thanks for asking! The AI will give a smart answer once the API is fully connected."
        : "Terima kasih atas soalan! AI akan jawab secara pintar bila API disambung sepenuhnya.";
    case "CHITCHAT":
      return isEn
        ? "Hey there! Thanks for joining the stream tonight, hope you are doing well!"
        : "Hai, terima kasih sebab join live malam ni! Semoga korang semua sihat.";
    case "PRODUCT_PITCH":
      return isEn
        ? "This product is totally worth it! Grab it now before it sells out."
        : "Produk ni memang berbaloi! Tekan beg kuning sekarang sebelum habis stok.";
    case "POLICY_REWRITE":
      return isEn
        ? "This is the policy-compliant version of the text."
        : "Ini versi teks yang sudah mematuhi polisi.";
  }
}

export async function routeAIRequest(task: TaskType, messages: any[]) {
  const route = ROUTING_TABLE[task];
  if (!route.provider.apiKey) {
    console.warn("[AI] No API key for", route.provider.name, "- using DEMO");
    return { content: demoContent(task, messages), providerUsed: "DEMO", modelUsed: "demo", latencyMs: 0 };
  }
  
  const modelsToTry = route.provider.name === "Groq" 
    ? (workingGroqModel ? [workingGroqModel, ...route.provider.models.filter(m => m !== workingGroqModel)] : route.provider.models)
    : route.provider.models;
  
  for (const model of modelsToTry) {
    try {
      const r = await callProvider(route.provider, model, messages, route.temperature, route.maxTokens);
      if (route.provider.name === "Groq") workingGroqModel = model;
      console.log(`[AI] ✅ ${route.provider.name} | ${model} | ${r.latencyMs}ms | "${r.content.slice(0, 50)}"`);
      return { content: r.content, providerUsed: route.provider.name, modelUsed: model, latencyMs: r.latencyMs };
    } catch (e: any) {
      if (e.message.includes("404") || e.message.includes("model_not_found")) {
        console.log(`[AI] ⏭️ ${model} not available, try next...`);
        continue;
      }
      console.error(`[AI] ${model} fail:`, e.message.slice(0, 100));
    }
  }
  
  if (providers.openrouter.apiKey) {
    try {
      const fb = await callProvider(providers.openrouter, providers.openrouter.models[0], messages, route.temperature, route.maxTokens);
      console.log(`[AI] ✅ OpenRouter fallback | ${fb.latencyMs}ms`);
      return { content: fb.content, providerUsed: "OpenRouter", modelUsed: providers.openrouter.models[0], latencyMs: fb.latencyMs, fallbackUsed: true };
    } catch (e2: any) {
      console.error("[AI] OpenRouter fallback fail:", e2.message);
    }
  }
  
  console.warn("[AI] All models fail - using DEMO");
  return { content: demoContent(task, messages), providerUsed: "DEMO-FALLBACK", modelUsed: "demo", latencyMs: 0 };
}

export async function classifyComment(text: string) {
  const r = await routeAIRequest("COMMENT_CLASSIFY", [
    { role: "system", content: 'Klasifikasi komen TikTok. intent mesti satu daripada: QUESTION | PURCHASE | CHITCHAT | SPAM | TOXIC. JSON sahaja, contoh: {"intent":"CHITCHAT","sentiment":"POSITIVE","confidence":0.9}' },
    { role: "user", content: text },
  ]);
  try {
    const m = r.content.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : r.content);
  } catch {
    return { intent: "CHITCHAT", sentiment: "NEUTRAL", confidence: 0.5 };
  }
}

export async function rewriteForCompliance(text: string, ruleId: string): Promise<string> {
  const r = await routeAIRequest("POLICY_REWRITE", [
    { role: "system", content: "Tulis semula ayat ini supaya mematuhi polisi TikTok Malaysia: tiada mengemis gift, tiada pancingan wang, tiada paksaan follow/share. Kekalkan nada mesra Bahasa Melayu pasar, 1-2 ayat pendek, tanpa emoji atau markdown." },
    { role: "user", content: text },
  ]);
  return r.content;
}

export async function generateBilingualResponse(text: string, context: string): Promise<{ text: string; lang: "MS" | "EN" }> {
  const lang = detectLang(text);
  const sys = lang === "MS"
    ? context + " JAWAB DALAM BAHASA MELAYU PASAR SANTAI. JANGAN jawab dalam English. Tanpa emoji, markdown, asterisk atau hashtag."
    : context + " REPLY IN NATURAL CASUAL ENGLISH. Do not reply in Malay. No emoji, markdown, asterisks or hashtags.";
  const r = await routeAIRequest("CHITCHAT", [
    { role: "system", content: sys },
    { role: "user", content: text },
  ]);
  return { text: r.content, lang };
}