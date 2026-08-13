interface AIProvider { name: string; baseURL: string; apiKey: string; defaultModel: string }

const providers: Record<string, AIProvider> = {
  qwen: { name: "Qwen-Max", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", apiKey: process.env.DASHSCOPE_API_KEY || "", defaultModel: "qwen-max-latest" },
  groq: { name: "Groq", baseURL: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY || "", defaultModel: "llama-3.3-70b-versatile" },
  gemini: { name: "Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: process.env.GEMINI_API_KEY || "", defaultModel: "gemini-1.5-flash" },
  openrouter: { name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY || "", defaultModel: "meta-llama/llama-3.3-70b-instruct:free" },
};

export type TaskType = "COMMENT_CLASSIFY" | "PRODUCT_PITCH" | "FAQ_REASONING" | "POLICY_REWRITE" | "CHITCHAT";

interface Route { provider: AIProvider; model: string; temperature: number; maxTokens: number }

const ROUTING_TABLE: Record<TaskType, Route> = {
  COMMENT_CLASSIFY: { provider: providers.groq, model: providers.groq.defaultModel, temperature: 0.3, maxTokens: 256 },
  CHITCHAT: { provider: providers.groq, model: providers.groq.defaultModel, temperature: 0.7, maxTokens: 512 },
  PRODUCT_PITCH: { provider: providers.qwen, model: providers.qwen.defaultModel, temperature: 0.8, maxTokens: 1024 },
  FAQ_REASONING: { provider: providers.qwen, model: providers.qwen.defaultModel, temperature: 0.6, maxTokens: 2048 },
  POLICY_REWRITE: { provider: providers.qwen, model: providers.qwen.defaultModel, temperature: 0.5, maxTokens: 1024 },
};

function pickProvider(preferred: AIProvider): AIProvider {
  if (preferred.apiKey) return preferred;
  const order = [providers.groq, providers.qwen, providers.gemini, providers.openrouter];
  return order.find((p) => p.apiKey) || preferred;
}

async function callProvider(p: AIProvider, model: string, messages: any[], temperature: number, maxTokens: number) {
  const start = Date.now();
  const res = await fetch(p.baseURL + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + p.apiKey },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error(p.name + " error " + res.status);
  const data: any = await res.json();
  return { content: data.choices?.[0]?.message?.content || "", latencyMs: Date.now() - start };
}

function demoContent(task: TaskType, messages: any[]): string {
  const userMsg = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  switch (task) {
    case "COMMENT_CLASSIFY":
      if (/harga|berapa|stok|stock/.test(userMsg)) return '{"intent":"QUESTION","sentiment":"NEUTRAL","confidence":0.9}';
      return '{"intent":"CHITCHAT","sentiment":"POSITIVE","confidence":0.8}';
    case "FAQ_REASONING":
      return "[DEMO MODE] Terima kasih atas soalan anda! Bila API key dipasang, AI akan jawab secara pintar.";
    case "CHITCHAT":
      return "[DEMO MODE] Hai, terima kasih sebab join live malam ni!";
    case "PRODUCT_PITCH":
      return "[DEMO MODE] Produk ni memang berbaloi! Tekan beg kuning sekarang.";
    case "POLICY_REWRITE":
      return "[DEMO MODE] Haha, malam ni kita borak santai je dulu ya!";
  }
}

export async function routeAIRequest(task: TaskType, messages: any[]) {
  const route = ROUTING_TABLE[task];
  const all = [pickProvider(route.provider), providers.groq, providers.qwen, providers.gemini, providers.openrouter];
  const seen = new Set<string>();
  for (const p of all) {
    if (!p.apiKey || seen.has(p.name)) continue;
    seen.add(p.name);
    try {
      const model = p.name === route.provider.name ? route.model : p.defaultModel;
      const r = await callProvider(p, model, messages, route.temperature, route.maxTokens);
      return { content: r.content, providerUsed: p.name, modelUsed: model, latencyMs: r.latencyMs };
    } catch (e) {
      console.error("[AI] " + p.name + " failed, trying next...");
    }
  }
  return { content: demoContent(task, messages), providerUsed: "DEMO", modelUsed: "demo", latencyMs: 0 };
}

export async function classifyComment(text: string) {
  const r = await routeAIRequest("COMMENT_CLASSIFY", [
    { role: "system", content: "Klasifikasi komen TikTok Live. JSON sahaja. intent MESTI salah satu: QUESTION, PURCHASE, CHITCHAT, SPAM, TOXIC. Contoh: berapa harga -> QUESTION; assalamualaikum -> CHITCHAT; nak beli macam mana -> PURCHASE; produk sampah -> TOXIC; join agen klik link -> SPAM." },
    { role: "user", content: text },
  ]);
  try { return JSON.parse(r.content); } catch { return { intent: "CHITCHAT", sentiment: "NEUTRAL", confidence: 0.5 }; }
}

export async function generateProductPitch(productTitle: string, productDescription: string, audienceContext: string): Promise<string> {
  const r = await routeAIRequest("PRODUCT_PITCH", [
    { role: "system", content: "Anda ialah BATIA, host jualan TikTok Malaysia. Tulis pitch 30 saat, Bahasa Melayu santai, highlight kelebihan, ajak tekan beg kuning. TIADA janji melampau, TIADA platform luar." },
    { role: "user", content: "Produk: " + productTitle + "\n" + productDescription + "\nKonteks: " + audienceContext },
  ]);
  return r.content;
}

export async function rewriteForCompliance(originalText: string, violationType: string): Promise<string> {
  const r = await routeAIRequest("POLICY_REWRITE", [
    { role: "system", content: "Anda ialah BATIA, host TikTok Malaysia. Komen penonton di bawah berpotensi melanggar polisi (begging gift / engagement bait). Tulis JAWAPAN host yang compliant: santai, 1-2 ayat, deflect dengan mesra, JANGAN penuhi permintaan yang melanggar, JANGAN minta gift balik. MESTI bahasa pasar MALAYSIA, BUKAN Indonesia. Elak perkataan: kalian, berbagi, konten, anda, mari kita, senang. Guna: korang, kongsi, je, ni, jom, best. Contoh: 'Haha terima kasih bang! Tapi malam ni kita borak santai je dulu ya!'" },
    { role: "user", content: "Komen penonton: " + originalText + "\nJenis isu: " + violationType + "\nJawapan compliant:" },
  ]);
  return r.content;
}


function detectLang(text: string): "MS" | "EN" {
  const ms = (text.match(/\b(tak|takde|nak|je|jom|korang|apa|macam|mana|kenapa|dah|ni|tu|kat|kita|saya|awak|aku|kamu|boleh|khabar|assalamualaikum|waalaikumussalam|santai|borak|cerita|harga|stok|beli|cantik|bang|kak|abang|malam|hari|esok|best|syok|memang|betul|kan|dengan|untuk|yang|dan|sila|maaf|lah|wei|woi|geng|member|lepak|bukan|sangat|juga|sama|dari|oleh|atau|jika|bila|sini|situ|tadi|baru|sudah|belum|masih|sedang|pernah|tidak|adakah)\b/gi) || []).length;
  const words = Math.max(1, text.trim().split(/\s+/).length);
  return ms / words >= 0.2 ? "MS" : "EN";
}

export async function generateBilingualResponse(userComment: string, hostContext: string): Promise<{ text: string; lang: "MS" | "EN" }> {
  const lang = detectLang(userComment);
  if (lang === "EN") {
    const r = await routeAIRequest("CHITCHAT", [
      { role: "system", content: "You are BATIA, a friendly Malaysian TikTok live host. IMPORTANT: ALWAYS reply in ENGLISH only, never Malay. Natural casual English, warm, ONE short sentence only (max 20 words). If asked about location, say Malaysia." },
      { role: "user", content: "Viewer comment: " + userComment },
    ]);
    return { text: r.content, lang: "EN" };
  }
  const r = await routeAIRequest("CHITCHAT", [
    { role: "system", content: "Anda ialah BATIA, host TikTok Malaysia. Jawab Bahasa Melayu pasar MALAYSIA (BUKAN Indonesia). Santai, 1-2 ayat. Guna: korang, takde, je, jom, best. ELAK: kalian, berbagi, konten, anda, mari kita." },
    { role: "user", content: "Komen penonton: " + userComment + "\nKonteks: " + hostContext },
  ]);
  return { text: r.content, lang: "MS" };
}