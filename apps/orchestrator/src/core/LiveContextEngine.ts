import { classifyComment, routeAIRequest, rewriteForCompliance, generateBilingualResponse, detectLang } from "../router/AIRouter.js";
import { findProducts, formatCatalogForAI } from "../catalog/ProductCatalog.js";
import { trackViewer } from "../memory/ViewerMemory.js";
import { PolicyEngine, PolicyViolation } from "../policy/PolicyEngine.js";
import { prisma } from "@batia/database";

const PERSONA = [
  "Anda ialah BATIA, host TikTok Live Malaysia yang mesra, sporting dan positif.",
  "Bual macam kawan rapat: Bahasa rojak natural (campuran Bahasa Melayu pasar + English) dibenarkan dan digalakkan.",
  "Gunakan BAHASA ROJAK MALAYSIA yang santai dan natural. Guna: takde, tak, nak, je, ni, tu, kenapa, jom, sebab, dah. Campur English bila sesuai.",
  "Contoh gaya natural rojak: 'Waalaikumussalam member! Khabar baik, you all macam mana?'",
  "Contoh gaya natural rojak: 'Haha malam ni kita borak santai je, jom kongsi cerita. You all dah makan ke belum?'",
  "Contoh gaya natural rojak: 'Wah thanks boss, appreciate sangat gift ni! You memang the best.'",
  "Contoh gaya natural rojak: 'Ok member, on kan lagu ni sekarang. Lagu ni memang fire gila!'",
  "Jawapan MESTI pendek, 1-2 ayat sahaja, gaya percakapan borak santai macam host Malaysia.",
  "WAJIB sebut perkataan dengan JELAS dan PENUH. JANGAN mengeja perkataan langsung.",
  "Contoh SALAH (jangan buat): 't-e-r-i-m-a', 'M-a-l-a-y-s-i-a', 't-h-a-n-k-s', 'a-p-p-r-e-c-i-a-t-e'",
  "Contoh BETUL: 'terima', 'Malaysia', 'thanks', 'appreciate' — tulis dan sebut perkataan penuh.",
  "WAJIB jawab HANYA dalam Bahasa Melayu pasar atau English atau campuran rojak. JANGAN guna bahasa lain (termasuk Chinese, Korean, Arabic). JANGAN sebut perkataan macam 直播间, stream room, live room dalam bahasa asing.",
  "JANGAN minta gift, follow, share, atau guna wang sebagai pancingan komen.",
  "Kalau soalan peribadi (alamat, gaji, pasangan), deflect dengan jenaka santai.",
  "JANGAN guna emoji, markdown, asterisk, hashtag, atau simbol khas dalam jawapan.",
  "JAWAB DENGAN 1 AYAT PENDEK SAHAJA (maksimum 15 patah perkataan) supaya cepat disebut.",
  "WAJIB sebut nama viewer (username) dalam setiap jawapan, guna perkataan seperti 'member ni' atau sebut nama terus.",
].join(" ");
const REGULAR_CONTEXT = "Ini SESI BORAK SANTAI (Regular Live). TIADA jualan malam ini. Kalau penonton tanya produk, harga, atau cara beli, jawab santai bahawa sekarang sesi borak, bukan sesi jualan, dan alihkan topik. JANGAN sebut harga atau buat pitch produk.";

const SHOPPABLE_CONTEXT = "Ini SESI SHOPPABLE LIVE (jualan). Jawab soalan produk dengan helpful, highlight kelebihan, dan ajak tekan beg kuning. Kalau tak pasti harga sebenar, ajak penonton tengok beg kuning untuk harga terkini.";

export interface ApprovalRequest {
  id: string;
  ruleId: string;
  severity: string;
  originalText: string;
  draft: string;
  username: string;
}

export class LiveContextEngine {
  private mode: "REGULAR" | "SHOPPABLE" = "REGULAR";
  constructor(private policy: PolicyEngine) {}

  setMode(m: "REGULAR" | "SHOPPABLE") {
    this.mode = m;
    console.log("[Engine] mode ->", m);
  }

  async handleComment(sessionId: string, username: string, text: string) {
    const memory = await trackViewer(username).catch(() => ({ isVip: false, visitCount: 1 }));
    const violations = this.policy.checkText(text, this.mode);
    const blocked = violations.find((v) => v.action === "BLOCK_AND_HOLD");

    if (blocked) {
      await prisma.violationLog.create({
        data: { ruleId: blocked.ruleId, triggeredText: text, action: "BLOCK_AND_HOLD" },
      });
      return { response: null, violations, approvalRequest: null };
    }

    const held = violations.find((v) => v.action === "AUTO_REWRITE_THEN_HOLD");
    if (held) {
      let draft = "Haha, nanti dulu ya! Kita borak santai je malam ni.";
      try {
        draft = await rewriteForCompliance(text, held.ruleId);
      } catch (e) {
        console.error("[Engine] rewrite failed, guna draft selamat:", e);
      }
      let logId = "tmp-" + Date.now();
      try {
        const log = await prisma.violationLog.create({
          data: { ruleId: held.ruleId, triggeredText: text, action: "PENDING_APPROVAL", resolvedText: draft },
        });
        logId = log.id;
      } catch (e) {
        console.error("[Engine] violation log failed:", e);
      }
      const approvalRequest: ApprovalRequest = {
        id: logId,
        ruleId: held.ruleId,
        severity: held.severity,
        originalText: text,
        draft,
        username,
      };
      return { response: null, violations, approvalRequest };
    }

    const classification = await classifyComment(text);
    await prisma.commentLog.create({
      data: { sessionId, username, text, intent: classification.intent },
    });

    let catalogInfo = "";
    if (this.mode === "SHOPPABLE") {
      const catalog = await findProducts(text).catch(() => []);
      catalogInfo = catalog.length > 0 ? "PRODUK PADAN: " + formatCatalogForAI(catalog) : "";
    }
    const memoryInfo = memory.isVip ? " (PENONTON VIP - dah komen " + memory.visitCount + " kali, sapa mesra)" : memory.visitCount > 1 ? " (dah komen " + memory.visitCount + " kali)" : "";
    const context = (this.mode === "REGULAR" ? REGULAR_CONTEXT : SHOPPABLE_CONTEXT) + " " + catalogInfo + memoryInfo;
    let response: string | null = null;
    const intent = classification.intent;

    if (intent === "SPAM" || intent === "TOXIC") {
      response = null;
    } else if (intent === "QUESTION" || intent === "PURCHASE") {
      const task = intent === "PURCHASE" && this.mode === "SHOPPABLE" ? "PRODUCT_PITCH" : "FAQ_REASONING";
      const lang = detectLang(text);
      const langInstr = lang === "MS" ? " JAWAB DALAM BAHASA MELAYU PASAR. Guna ejaan 'ya' (bukan 'ye'), 'tak' (bukan 'takpe'), 'boleh' (bukan 'bole')." : " REPLY IN NATURAL CASUAL ENGLISH.";
      const r = await routeAIRequest(task, [
        { role: "system", content: PERSONA + " " + context + langInstr },
        { role: "user", content: username + ": " + text },
      ]);
      response = r.content;
    } else {
      const r = await generateBilingualResponse(text, PERSONA + " " + context);
      console.log("[ENGINE] lang=" + r.lang + " for:", text.slice(0, 40));
      response = r.text;
    }
    return { response, violations, approvalRequest: null };
  }

  async handleGift(sessionId: string, username: string, giftName: string, giftValue: number) {
    await prisma.giftLog.create({ data: { sessionId, username, giftName, giftValue } });
    const r = await routeAIRequest("CHITCHAT", [
      { role: "system", content: PERSONA + " Ucap terima kasih atas gift dengan ikhlas. JANGAN minta lagi gift." },
      { role: "user", content: username + " baru bagi " + giftName },
    ]);
    return r.content;
  }
}


