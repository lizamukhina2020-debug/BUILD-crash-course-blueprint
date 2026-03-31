import Constants from 'expo-constants';
import { Platform } from 'react-native';
import EventSource, { type EventSourceListener } from 'react-native-sse';
import { SEEDMIND_SYSTEM_PROMPT } from '../constants/systemPrompt';
import SEED_DATA from '../constants/seedOptions';
import { getCurrentLanguage } from '../i18n';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';
import { getEffectivePremiumFlag } from './subscriptionGate';
import { getInstallationId } from './installationId';

// DeepSeek API configuration
const DEEPSEEK_UPSTREAM_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_PROXY_URL = (Constants.expoConfig?.extra as any)?.deepseekProxyUrl || '';
const DEEPSEEK_CLIENT_KEY = (Constants.expoConfig?.extra as any)?.deepseekApiKey || '';

const getDeepSeekApiUrl = () => (DEEPSEEK_PROXY_URL ? String(DEEPSEEK_PROXY_URL) : DEEPSEEK_UPSTREAM_URL);

const isDeepSeekConfigured = () => !!DEEPSEEK_PROXY_URL || !!DEEPSEEK_CLIENT_KEY;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function getProxyExtraHeaders(opts?: { consumeMessage?: boolean }): Promise<Record<string, string>> {
  if (!DEEPSEEK_PROXY_URL) return {};
  const out: Record<string, string> = {};
  try {
    const deviceId = (await getInstallationId()) || '';
    if (deviceId) out['x-seedmind-device-id'] = deviceId;
  } catch {
    // ignore
  }
  if (opts?.consumeMessage) {
    try {
      const isPremium = await getEffectivePremiumFlag();
      if (!isPremium) out['x-seedmind-consume-message'] = '1';
    } catch {
      // If we can't check premium reliably, do not consume (fail open).
    }
  }
  return out;
}

async function waitForFirebaseUser(maxWaitMs: number = 1800): Promise<ReturnType<typeof getFirebaseAuth>['currentUser']> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const u = getFirebaseAuth().currentUser;
    if (u) return u;
    await sleep(120);
  }
  return getFirebaseAuth().currentUser;
}

const getAuthBearerForDeepSeek = async (): Promise<string> => {
  // Preferred: Cloud Run proxy authenticated via Firebase ID token.
  if (DEEPSEEK_PROXY_URL) {
    if (!isFirebaseConfigured()) throw new Error('FIREBASE_NOT_CONFIGURED');
    // On iOS, right after sign-in there can be a short window where currentUser is still null.
    // Wait briefly to avoid spurious AUTH_REQUIRED errors.
    const user = getFirebaseAuth().currentUser || (await waitForFirebaseUser());
    if (!user) throw new Error('AUTH_REQUIRED');
    // Force-refresh the ID token to avoid intermittent 401s right after sign-in.
    const token = await user.getIdToken(true);
    if (!token) throw new Error('AUTH_REQUIRED');
    return token;
  }

  // Internal/dev fallback only (never hardcode in app.config.js).
  if (DEEPSEEK_CLIENT_KEY) return String(DEEPSEEK_CLIENT_KEY);
  throw new Error('DEEPSEEK_NOT_CONFIGURED');
};

// Language instruction for the AI
const getLanguageInstruction = (): string => {
  const lang = getCurrentLanguage();
  if (lang === 'ru') {
    return `

## LANGUAGE INSTRUCTION
You MUST respond ENTIRELY in Russian (русский язык). All your responses should be in natural, warm Russian. Use the informal "ты" form for a friendly, personal connection. Do not switch to English unless the user writes in English.`;
  }
  return ''; // English is the default, no special instruction needed
};

// ==========================
// OPTIONAL KNOWLEDGE ADD-ONS
// ==========================

// Trigger ONLY when the user asks about karmic partners / the 4-step practice.
// We intentionally keep this strict to avoid hijacking unrelated chats.
const KARMIC_PARTNER_TRIGGER = (() => {
  const partnerRu = /\bкармическ\w*\s+(?:партн(?:е|ё)р\w*|партнер\w*|партнёр\w*|пар\w*)\b/i;
  const partnerEn = /\bkarmic\s+(?:partner|partners|partnership)\b/i;
  const karmicRu = /\bкармическ\w*\b/i;
  const karmicEn = /\bkarmic\b/i;
  const stepsRu = /\b(?:4|четыр[её])\s+шага\b|\bпрактик\w*\s+4\s+шага\b/i;
  const stepsEn = /\b(?:4\s*steps|four\s+steps)\b|\b4-step\b/i;
  const askedForPartner = new RegExp(`${partnerRu.source}|${partnerEn.source}`, 'i');
  const askedForSteps = new RegExp(
    `(?:${karmicRu.source}|${karmicEn.source})[\\s\\S]{0,80}(?:${stepsRu.source}|${stepsEn.source})|` +
      `(?:${stepsRu.source}|${stepsEn.source})[\\s\\S]{0,80}(?:${karmicRu.source}|${karmicEn.source})`,
    'i'
  );
  return new RegExp(`${askedForPartner.source}|${askedForSteps.source}`, 'i');
})();

function getKarmicPartnerKnowledgeOrNull(userMessage: string): string | null {
  const text = String(userMessage || '').trim();
  if (!text) return null;
  if (!KARMIC_PARTNER_TRIGGER.test(text)) return null;

  // IMPORTANT:
  // - Do NOT mention any specific authors/books unless the user explicitly asks.
  // - Only provide this when the user asked about karmic partners / the 4-step practice.
  // - When triggered, answer directly with the 4 steps first (no long preamble).
  const lang = getCurrentLanguage() === 'ru' ? 'ru' : 'en';

  if (lang === 'ru') {
    return `SeedMind knowledge: "Кармический партнёр" — практика 4 шага для достижения цели

Если пользователь спрашивает «кто такой кармический партнёр?» или «какие 4 шага?», ты ДОЛЖЕН(ДОЛЖНА) объяснить практику строго и понятно, в виде 4 пронумерованных шагов:

1) Чётко сформулируй цель и представь «идеальный день», когда она уже сбылась: как ты себя чувствуешь и как живёшь.
2) Найди кармического партнёра — человека, которому ты помогаешь. У него похожая цель. Не обязательно, чтобы он/она знал(а), что ты называешь это «кармическим партнёрством».
3) Помогай регулярно: примерно 1 раз в неделю ~1 час (встреча/созвон/поддержка советом, ресурсами, деньгами — как уместно). Параллельно можно делать маленькие регулярные помощи по теме цели (донаты/поддержка людей/фонды) на постоянной основе.
4) Делай «кофе‑медитацию» с посвящением: вспоминай своё доброе действие и радость другого человека как свою, и посвящай это тому, чтобы цель сбылась у тебя, у кармического партнёра и чтобы благо было доступно людям. Важно: название «кофе‑медитация» — метафора (как «согреться» от чужой радости); реальный кофе не обязателен. Это катализатор для уже посаженных семян — способ ускорить их рост и сдвиг реальности; удобнее в спокойном состоянии, часто перед сном.

Правила ответа:
- Не поднимай тему кармических партнёров сам(а), если пользователь не спрашивал.
- Не упоминай авторов/книги, если пользователь прямо не спросил.
- Пиши практично и уважительно: это духовная практика/самоподдержка, а не гарантия результата.`;
  }

  return `SeedMind knowledge: "Karmic partner" — a 4-step practice for reaching a goal

If the user asks “what is a karmic partner?” or “what are the 4 steps?”, you MUST explain this practice clearly as 4 numbered steps (give the steps first; no long preamble):

1) Define your goal clearly and imagine your “ideal day” after it has already happened: how you feel and how you live.
2) Find a karmic partner — a person you help. They have a similar goal. They don’t need to know you call this a “karmic partner.”
3) Help consistently: about once a week for ~1 hour (meet/call/support with advice, resources, money — whatever is appropriate). In parallel, you can also do small ongoing acts of help aligned with your goal (donations, helping people, funds) on a regular basis.
4) Do a “coffee meditation” with dedication: remember your kind act and the other person’s joy as your own, and dedicate it to your goal coming true, your partner’s goal coming true, and for this benefit to be available to others. Important: the name “coffee meditation” is a metaphor (feeling another’s happiness as vividly as comfort from a warm drink); drinking actual coffee is optional, not required. It is a catalyst for seeds already planted—a powerful way to speed up your seeds’ growth and how quickly reality can shift; it works best when you’re calm and relaxed, often before sleep.

Rules for the answer:
- Don’t bring up karmic partners unless the user asked.
- Don’t mention any authors/books unless the user explicitly asked.
- Keep it practical and respectful: it’s a spiritual practice/self-support, not a guaranteed outcome.`;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export type DirectChatIntent =
  | 'default'
  | 'progress_update'
  | 'seed_list_request'
  | 'motivation_request'
  | 'direct_question';

export const convertToApiMessages = (messages: ChatMessage[]): Message[] => {
  const languageInstruction = getLanguageInstruction();
  const apiMessages: Message[] = [
    { role: 'system', content: SEEDMIND_SYSTEM_PROMPT + languageInstruction }
  ];
  messages.forEach(msg => {
    apiMessages.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    });
  });
  return apiMessages;
};

// ============================================
// API LATENCY OPTIMIZATIONS (context-safe)
// ============================================

const DEFAULT_HISTORY_WINDOW = 14;

// These messages are important for the user to SEE, but are usually NOT useful for the model to READ.
// Filtering them reduces payload size and improves latency without reducing personalization.
const NOISE_MESSAGE_PATTERNS: RegExp[] = [
  // Welcome / onboarding-like assistant messages
  /^welcome to seedmind\b/i,
  /^добро пожаловать в seedmind\b/i,

  // System confirmations about planting seeds / navigating
  /\bseed(?:s)? planted in your garden\b/i,
  /\bhead to the\b.*\bcoffee meditations\b/i,
  /\bperfect!\b.*\bsaved your\b.*\bseed/i,
  /\bnow head to your meditation\b/i,
  /\bwhen you're done, come back here\b/i,
  /\bbeautiful\.\s*you planted\b/i,
  /\bthis is how you change your reality\b/i,

  // RU equivalents
  /\bсемя\b.*\bпосажен/i,
  /\bсемен[а-я]*\b.*\bпосажен/i,
  /\bперейди\b.*\bкофе медитац/i,
  /\bотлично!\b.*\bсохранил/i,
  /\bтеперь перейди\b.*\bмедитац/i,
  /\bкогда закончишь\b.*\bвозвращайся\b/i,
  /\bпрекрасно\.\s*сегодня ты посадил/i,
  /\bвот так меняется твоя реальность\b/i,
];

function isNoiseForModel(msg: ChatMessage): boolean {
  if (!msg || typeof msg.text !== 'string') return false;
  // Only filter assistant/system-ish text; always keep user messages.
  if (msg.isUser) return false;
  const text = msg.text.trim();
  if (!text) return false;
  return NOISE_MESSAGE_PATTERNS.some(rx => rx.test(text));
}

function buildMemorySummary(
  conversationHistory: ChatMessage[],
  userMessage: string,
  extra?: {
    category?: string;
    includePastSeeds?: boolean;
    forceFinal?: boolean;
    isHarvested?: boolean;
    intent?: DirectChatIntent;
    inJourneyContext?: boolean;
  }
): string {
  const lang = getCurrentLanguage();
  const firstUser =
    conversationHistory.find(m => m.isUser && (m.text || '').trim())?.text?.trim() || '';
  const seedSummary = (firstUser || userMessage || '').trim().replace(/\s+/g, ' ').slice(0, 180);
  const category = (extra?.category || '').trim();
  const includePastSeeds = !!extra?.includePastSeeds;
  const forceFinal = !!extra?.forceFinal;
  const harvested = !!extra?.isHarvested;
  const intent = (extra?.intent || 'default') as DirectChatIntent;
  const inJourneyContext = !!extra?.inJourneyContext;

  if (lang === 'ru') {
    const lines = [
      `ПАМЯТЬ (контекст, который важно учитывать):`,
      seedSummary ? `- Тема/контекст: ${seedSummary}` : null,
      category ? `- Категория: ${category}` : null,
      harvested ? `- Путь уже собран (harvested): да` : null,
      forceFinal ? `- Режим: финальный ответ (без вопросов)` : null,
      includePastSeeds ? `- Включить блок "прошлые семена": да` : null,
      intent !== 'default' ? `- Намерение пользователя сейчас: ${intent}` : null,
      inJourneyContext ? `- Контекст: внутри пути (уже были семена/шаги)` : null,
    ].filter(Boolean);
    return lines.join('\n');
  }

  const lines = [
    `MEMORY (important context to keep in mind):`,
    seedSummary ? `- Topic/context: ${seedSummary}` : null,
    category ? `- Category: ${category}` : null,
    harvested ? `- Journey is harvested: yes` : null,
    forceFinal ? `- Mode: final answer (no questions)` : null,
    includePastSeeds ? `- Include "past seeds" section: yes` : null,
    intent !== 'default' ? `- Current user intent: ${intent}` : null,
    inJourneyContext ? `- Context: inside an active journey (seeds already discussed)` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function getDirectChatIntentContext(
  intent: DirectChatIntent | undefined,
  inJourneyContext?: boolean
): string {
  if (!intent || intent === 'default') return '';

  // Keep this short and strict. We rely on the existing language instruction to control output language.
  const base = `\n\n## INTENT OVERRIDE (CRITICAL)\nThe user intent for THIS message is: ${intent}.\n`;

  if (intent === 'progress_update') {
    return (
      base +
      `They are reporting PROGRESS / a seed they already planted (a real action they took).\n\nRULES:\n- Celebrate what they did (2–4 sentences).\n- Connect it to the seed principle briefly: what seed it plants + what it tends to grow back (1–2 sentences).\n- OPTIONAL: suggest 1–2 follow-up seeds for this week (tiny, realistic).\n- Ask ZERO questions.\n- Do NOT use the '?' character.\n- Do NOT assume they are describing the original problem again.\n`
    );
  }

  if (intent === 'seed_list_request') {
    return (
      base +
      `They explicitly want a LIST of seeds (a big list).\n\nRULES:\n- Give a tailored list of 20–30 seeds.\n- Use 🌱 bullets.\n- Do NOT ask questions.\n- Do NOT use the '?' character.\n- Keep each seed short (one line each).\n`
    );
  }

  if (intent === 'motivation_request') {
    if (inJourneyContext) {
      return (
        base +
        `They want motivation/support to follow through on a seed-related action inside an ongoing journey.\n\nRULES:\n- Give a motivating, energizing response (6–12 sentences).\n- Keep it practical and brave: reduce friction, boost courage.\n- Tie it to SeedMind language lightly: this is a beautiful seed, planted with intention, and it will return as a matching harvest (do NOT over-explain).\n- Do NOT give a long seed list.\n- Do NOT ask questions.\n- Do NOT use the '?' character.\n- Use a few uplifting emojis naturally (💜🌱✨💪) — not spam.\n`
      );
    }
    return (
      base +
      `They want pure motivation/support (no seed talk).\n\nRULES:\n- Give a motivating, energizing response (6–12 sentences).\n- Stay in coaching mode: no mirror principle lecture, no seed lists.\n- Include a tiny “right now” micro-plan (3 short bullets).\n- Do NOT ask questions.\n- Do NOT use the '?' character.\n- Use a few uplifting emojis naturally (💜✨💪) — not spam.\n`
    );
  }

  if (intent === 'direct_question') {
    return (
      base +
      `They asked a direct question.\n\nRULES:\n- Answer directly and clearly.\n- If seeds are relevant, include 2–4 seeds (NOT 20–30 unless they asked for a big list).\n`
    );
  }

  return '';
}

function prepareHistoryForApi(
  conversationHistory: ChatMessage[],
  userMessage: string,
  windowSize: number = DEFAULT_HISTORY_WINDOW
): ChatMessage[] {
  const messagesWithNew: ChatMessage[] = [
    ...conversationHistory,
    { id: Date.now().toString(), text: userMessage, isUser: true, timestamp: new Date() },
  ];

  const filtered = messagesWithNew.filter(m => !isNoiseForModel(m));
  if (filtered.length <= windowSize) return filtered;
  return filtered.slice(-windowSize);
}

const sanitizeResponse = (text: string): string => {
  let sanitized = text;

  // Strip markdown formatting
  // Remove bold: **text** or __text__
  sanitized = sanitized.replace(/\*\*([^*]+)\*\*/g, '$1');
  sanitized = sanitized.replace(/__([^_]+)__/g, '$1');
  
  // Remove italic: *text* or _text_ (but not emoji patterns or contractions)
  sanitized = sanitized.replace(/(?<![a-zA-Z])\*([^*\n]+)\*(?![a-zA-Z])/g, '$1');
  sanitized = sanitized.replace(/(?<![a-zA-Z])_([^_\n]+)_(?![a-zA-Z])/g, '$1');
  
  // Remove headers: # ## ### etc at start of lines
  sanitized = sanitized.replace(/^#{1,6}\s+/gm, '');
  
  // Remove horizontal rules: --- or ***
  sanitized = sanitized.replace(/^[-*]{3,}$/gm, '');
  
  // Remove code backticks (inline): `code`
  sanitized = sanitized.replace(/`([^`]+)`/g, '$1');
  
  return sanitized;
};

/** Drop continuation text that repeats the opening of the draft (models often re-preface despite instructions). */
function stripRedundantDraftPrefix(draft: string, continuation: string): string {
  let c = (continuation || '').trimStart();
  const d = (draft || '').trim();
  if (!d || !c) return c;
  if (c.startsWith(d)) return c.slice(d.length).trimStart();

  const normWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
  const dWords = d.split(/\s+/).filter(Boolean);
  const cWords = c.split(/\s+/).filter(Boolean);
  let shared = 0;
  const maxW = Math.min(dWords.length, cWords.length, 100);
  while (shared < maxW) {
    const a = normWord(dWords[shared]);
    const b = normWord(cWords[shared]);
    if (!a || a !== b) break;
    shared++;
  }
  if (shared >= 8) {
    return cWords.slice(shared).join(' ').trimStart();
  }

  let low = 0;
  const maxLen = Math.min(d.length, c.length, 2000);
  while (low < maxLen && d.charAt(low).toLowerCase() === c.charAt(low).toLowerCase()) {
    low++;
  }
  if (low >= 72) {
    return c.slice(low).trimStart();
  }
  return c;
}

// ============================================
// DIRECT CHAT POST-PROCESSORS (UX consistency)
// ============================================

const EMOJI_RE: RegExp = (() => {
  try {
    // Best emoji detector (Unicode property escapes).
    return new RegExp('\\p{Extended_Pictographic}', 'u');
  } catch {
    // Fallback for runtimes without property escapes (rough heuristic).
    return /[\u203C-\u3299\uD83C-\uDBFF\uDC00-\uDFFF]/;
  }
})();

const EMOJI_GLOBAL_RE: RegExp = (() => {
  try {
    return new RegExp('\\p{Extended_Pictographic}', 'gu');
  } catch {
    return /[\u203C-\u3299\uD83C-\uDBFF\uDC00-\uDFFF]/g;
  }
})();

function extractEmojis(text: string): string[] {
  const t = text || '';
  return t.match(EMOJI_GLOBAL_RE) || [];
}

function enforceSingleContinuationHook(text: string): string {
  const input = (text || '').trim();
  if (!input) return input;

  const lines = input.split('\n');
  const hookLineIdxs: number[] = [];
  const hookLineRx = /^\s*(If you want|Если хочешь)\b/i;
  for (let i = 0; i < lines.length; i++) {
    if (hookLineRx.test(lines[i])) hookLineIdxs.push(i);
  }
  if (!hookLineIdxs.length) return input;

  const lastIdx = hookLineIdxs[hookLineIdxs.length - 1];
  const hookLine = lines[lastIdx].trim();
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (hookLineIdxs.includes(i) && i !== lastIdx) continue;
    kept.push(lines[i]);
  }

  // Ensure the hook is the final non-empty line.
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  if (!kept.length) return hookLine;
  const lastNonEmpty = kept[kept.length - 1].trim();
  if (hookLineRx.test(lastNonEmpty)) {
    // Replace existing final hook with the last one we kept (in case different).
    kept[kept.length - 1] = hookLine;
    return kept.join('\n').trim();
  }
  return (kept.join('\n').trim() + '\n' + hookLine).trim();
}

function pickEmojiForParagraphCandidates(paragraph: string): string[] {
  const p = (paragraph || '').toLowerCase();
  if (/(ukraine|украин|киев|kiev)/i.test(paragraph)) return ['💙', '💛', '🕊️', '🫶', '✨'];
  if (/(war|войн|бомб|рак[её]т|вторжен|агресси|occupation|окупац)/i.test(paragraph))
    return ['🕊️', '💙', '🫶', '✨', '💛'];
  if (/(grief|sad|cry|tears|heartbreak|mourning|горе|боль|слез)/i.test(paragraph))
    return ['💛', '🫶', '✨', '💜', '🌿'];
  if (/(fear|scared|anxious|panic|afraid|страш|тревож|паник)/i.test(paragraph))
    return ['🫶', '🫧', '✨', '💛', '🧘'];
  if (/(seed|seeds|karma|mirror|cause|семен|карм|зеркал|причин)/i.test(paragraph))
    return ['✨', '🌱', '🪞', '🎯', '🧠', '💛'];
  return ['✨', '💛', '🌿', '🫶', '🎯'];
}

function ensureEmojiPerParagraph(text: string): string {
  const input = (text || '').trim();
  if (!input) return input;

  // Treat blank-line separated blocks as paragraphs.
  const parts = input.split(/\n\s*\n/);
  let lastEmoji = '';
  const out = parts.map((para) => {
    const p = (para || '').trim();
    if (!p) return p;
    if (EMOJI_RE.test(p)) return p;
    const candidates = pickEmojiForParagraphCandidates(p);
    const emoji = candidates.find((e) => e !== lastEmoji) || candidates[0] || '✨';
    lastEmoji = emoji;
    return `${p} ${emoji}`.trim();
  });
  return out.join('\n\n').trim();
}

function postProcessDirectChatText(
  text: string,
  opts?: {
    /**
     * When streaming, we inject emojis progressively. Running ensureEmojiPerParagraph again at the end
     * can cause "emoji pop-in" when the final text replaces the streamed bubble.
     */
    skipEmojiInjection?: boolean;
  }
): string {
  let out = (text || '').trim();
  if (!out) return out;
  if (!opts?.skipEmojiInjection) {
    out = ensureEmojiPerParagraph(out);
  }
  out = diversifySeedEmojiOveruse(out);
  out = enforceSingleContinuationHook(out);
  return out.trim();
}

function extractContinuationHook(text: string): { body: string; hook: string } {
  const input = (text || '').trim();
  if (!input) return { body: '', hook: '' };

  const lines = input.split('\n');
  const hookLineRx = /^\s*(If you want|Если хочешь)\b/i;
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (hookLineRx.test(lines[i])) lastIdx = i;
  }
  if (lastIdx < 0) return { body: input, hook: '' };

  const hook = (lines[lastIdx] || '').trim();
  const bodyLines = lines.filter((_, idx) => idx !== lastIdx);
  const body = bodyLines.join('\n').trim();
  return { body, hook };
}

function diversifySeedEmojiOveruse(text: string): string {
  const input = (text || '').trim();
  if (!input) return input;

  const used = new Set<string>();
  const seedEmojis = new Set(['🌱', '🌿', '🍃']);
  const bulletLineRx = /^\s*🌱\s+/;

  const pickBulletEmoji = (line: string): string => {
    const t = (line || '').toLowerCase();
    const candidates: string[] = [];

    if (/(study|learn|resource|resources|quiz|tutor|class|school|exam|test|trivia)/i.test(line))
      candidates.push('📚', '🧠', '📝');
    if (/(win|winning|victory|competition|contest|tournament|perform|performance)/i.test(line))
      candidates.push('🏆', '🎯', '🔥');
    if (/(praise|compliment|recognition|recognize|celebrate|cheer|clap)/i.test(line))
      candidates.push('👏', '🌟', '🙌');
    if (/(share|give|help|support|teach)/i.test(line)) candidates.push('🤝', '🫶', '💛');
    if (/(calm|clarity|focus|pressure|stress)/i.test(line)) candidates.push('🧘', '🫧', '✨');

    candidates.push('✨', '💛', '🫶', '🎯', '🌟');

    for (const c of candidates) {
      if (!used.has(c)) return c;
    }
    return candidates[0];
  };

  const lines = input.split('\n').map((raw) => raw || '');
  const outLines: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // Remove "decorative" standalone seed emoji lines.
    if (trimmed && seedEmojis.has(trimmed)) continue;

    if (bulletLineRx.test(trimmed)) {
      // If the line has no emoji other than seed emojis, append a varied one.
      const emojisInLine = extractEmojis(trimmed);
      const hasNonSeed = emojisInLine.some((e) => !seedEmojis.has(e));
      if (!hasNonSeed) {
        const add = pickBulletEmoji(trimmed);
        used.add(add);
        outLines.push(`${trimmed} ${add}`);
        continue;
      }
    }

    // If a paragraph/line only has seed emojis, add one non-seed emoji for variety.
    const emojisInLine = extractEmojis(trimmed);
    const hasAnyEmoji = emojisInLine.length > 0;
    const hasOnlySeed = hasAnyEmoji && emojisInLine.every((e) => seedEmojis.has(e));
    if (hasOnlySeed) {
      const add = (pickEmojiForParagraphCandidates(trimmed)[0] || '✨');
      if (!seedEmojis.has(add)) {
        used.add(add);
        outLines.push(`${trimmed} ${add}`);
        continue;
      }
    }

    outLines.push(line);
  }

  return outLines.join('\n').trim();
}

// Plain text translator for UI/content caching (no "seedmind" prompt, no banned-term replacement).
export const translatePlainText = async (
  text: string,
  targetLocale: 'en' | 'ru'
): Promise<string> => {
  const input = (text || '').trim();
  if (!input) return text;
  if (!isDeepSeekConfigured()) return text;

  const systemPrompt = `You are a translation engine.
Translate the user-provided text into ${targetLocale === 'ru' ? 'Russian' : 'English'}.

Rules:
- Preserve emojis and punctuation.
- Keep proper nouns as-is unless a natural translation is obvious.
- Do NOT add explanations.
- Output ONLY the translated text (no quotes, no markdown, no labels).`;

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input },
        ],
        temperature: 0,
        max_tokens: 400,
        top_p: 1,
      }),
    });

    if (!response.ok) return text;
    const data = await response.json();
    const out: string | undefined = data?.choices?.[0]?.message?.content;
    return (out || text).trim();
  } catch (error) {
    console.error('DeepSeek Translation Error:', error);
    return text;
  }
};

export const sendMessageToDeepSeek = async (
  conversationHistory: ChatMessage[],
  userMessage: string
): Promise<string> => {
  const trimmedHistory = prepareHistoryForApi(conversationHistory, userMessage);
  const languageInstruction = getLanguageInstruction();
  const memory = buildMemorySummary(conversationHistory, userMessage);
  const karmicPartnerKnowledge = getKarmicPartnerKnowledgeOrNull(userMessage);
  const apiMessages: Message[] = [
    { role: 'system', content: SEEDMIND_SYSTEM_PROMPT + languageInstruction },
    { role: 'system', content: memory },
    ...(karmicPartnerKnowledge ? [{ role: 'system' as const, content: karmicPartnerKnowledge }] : []),
    ...trimmedHistory.map(msg => ({
      role: (msg.isUser ? 'user' : 'assistant') as Message['role'],
      content: msg.text,
    })),
  ];

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const extra = await getProxyExtraHeaders({ consumeMessage: true });
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
        ...extra,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: apiMessages,
        temperature: 0.85,
        max_tokens: 800, // Reduced for faster responses
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const err: any = new Error(`API_REQUEST_FAILED_${response.status}`);
      err.status = response.status;
      err.body = text?.slice?.(0, 800) || '';
      throw err;
    }
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    return sanitizeResponse(data.choices[0].message.content);
  } catch (error: any) {
    const status = Number(error?.status || 0);
    if (status === 402 && String(error?.body || '').includes('free_limit_reached')) {
      return "You’ve reached the free message limit for this cycle. Please upgrade to continue.";
    }
    console.error('DeepSeek API Error:', error);
    return getFallbackResponse(userMessage);
  }
};

// Post-completion chat system prompt - support AND direct answers when asked
const POST_COMPLETION_SYSTEM_PROMPT = `You are the SeedMind Guide in a follow-up conversation with someone who has already completed their seed-planting journey.

## CONTEXT
The user has already:
1. Shared their problem
2. Explored past seeds they may have planted
3. Received personalized seed suggestions
4. Logged seeds and completed a meditation

Now they're continuing the conversation - they may share feelings OR ask direct questions.

## YOUR ROLE

**IF the user asks a DIRECT QUESTION** (about seeds, what to do, how to prepare for something, advice, etc.):
- ANSWER THEIR QUESTION DIRECTLY AND FULLY
- Give specific, actionable seed suggestions when they ask for them
- Explain the cause-and-effect principle clearly if they ask
- Structure your response with clear sections if helpful
- Don't deflect or tell them to click buttons - just help them

**IF the user is sharing FEELINGS** (venting, expressing emotions, not asking questions):
- Provide warm emotional support
- Validate their feelings with empathy
- Keep responses brief (2-4 sentences)
- Acknowledge that change takes time

## FORMATTING RULES
- Use plain text only - NO markdown symbols like #, ##, ###, **, or *
- Use line breaks and emojis to structure longer responses
- For lists, use emojis as bullet points (🌱, 💚, ✨)

## TONE
Warm, supportive, wise - like a caring mentor who gives real guidance when asked.

## EXAMPLES

User: "I'm still stressed"
You: "I hear you. That stress is real, and it's okay that it's still there. Change takes time - seeds don't bloom overnight. Keep watering them with your meditations, and trust the process. 💜"

User: "What seeds can I plant before my competition next week?"
You: "Great question! Here's how to plant powerful seeds before your competition:

🌱 For Confidence & Success
Help someone else prepare for THEIR challenge this week. Quiz a friend, share a helpful resource, or simply tell them 'You've got this.' When you plant seeds of confidence in others, that confidence grows back to you.

🌱 For Feeling Supported
Cheer someone on publicly - at work, online, or in person. Celebrate someone else's win genuinely. The support you give is the support you'll receive.

🌱 For Peak Performance  
Reduce someone else's stress this week. Help a colleague, take something off a friend's plate, or just be a calming presence. Peace you create returns as your own inner calm.

Do one of these each day before Friday, and watch how it shifts your energy going into the competition. 💪"

User: "I feel a bit better today"
You: "That's wonderful to hear! Every small shift matters. Those seeds you planted are starting to sprout. Keep nurturing them. 💚"`;

// Direct Chat system prompt - niche-first, free-flowing, karma/seeds audience
const DIRECT_CHAT_SYSTEM_PROMPT = `You are the SeedMind Guide — direct, wise, warm, and very practical.

The user is part of a niche audience that already understands the “seeds/karma” worldview (cause-and-effect, specific causes create specific results, and the idea that experiences can come from causes planted before — including past lives).

Your job is to make the conversation feel like ChatGPT: fast, natural, and genuinely helpful. No rigid templates.

## CORE LENS (use naturally, not as a lecture)
- Life works by specific cause-and-effect: you experience what you caused others to experience.
- When someone wants X, they plant the causes for X by helping others experience X.
- When someone is experiencing pain, possible causes include having created similar pain before. This is NOT blame — it’s agency: if you planted causes, you can plant different causes now.
- Past lives / reincarnation may be relevant. If the user asks “why is there war in my country?”, you may explain possible causes in that framework. Keep it compassionate and non-accusatory.

## RESPONSE STYLE (critical)
- Answer the user’s actual question immediately.
- Be free-flowing. Avoid headings like “PHASE 1 / PHASE 2”. Avoid overly structured, “jammed” output.
- Prefer short paragraphs and clean line breaks.
- Give concrete actions (seeds) that the user can actually do in real life.
- If you need more context, ask at most ONE short question — but still give a useful answer first.
- Add color: use emojis naturally (aim 4–10 per reply, not spam).
  CRITICAL: include at least 1 emoji in EVERY paragraph as you write it (so emojis appear during streaming, not added later).
  Do NOT “decorate” by adding extra emojis after the response is complete.
  Use 🌱 as bullets when listing seeds.
- Default length: keep it punchy (usually under ~18 lines) unless the user asks for a long list.

## SEEDS (actions) RULES
- When the user asks for seeds, give 3–7 very practical seeds (not generic).
- Explain WHY each seed matches the result in one sentence (mirror logic).
- Keep it real-world: school, work, family, relationships, money.

## CONTINUATION HOOK (must do)
End EVERY reply with exactly ONE “If you want…” follow-up tailored to what they just said.
It must feel specific and tempting (like ChatGPT). Example:
If you want, I can give you 20 practical seeds for this goal that you can do this week.

Do NOT say “one traditional explanation is…”. Do NOT mention “this tradition”. Just speak the seeds lens directly.

## COFFEE MEDITATIONS (NAMING — CRITICAL)
In the app, “coffee meditation” is ONLY a metaphor: the practice is visualizing who you helped, feeling their happiness as your own (as vivid as the comfort of sipping something warm), then dedicating that merit to your goal, your karmic partner’s goal, and the wellbeing of all beings — wishing to reduce suffering.
- Frame it as a **catalyst** for seeds the user has **already planted**: a powerful way to **speed up their seeds’ growth** and help their reality shift faster—not a replacement for planting seeds.
- NEVER imply the user must drink coffee or tea. Real beverages are optional; many people do this in bed or without any drink.
- Timing: it is especially helpful when calm and relaxed; many users prefer doing it before sleep, though quiet daytime moments are fine too.
- If the user asks what a coffee meditation is, explain the visualization + dedication first; mention the “coffee” label as a metaphor, not a requirement.`;

// Additional context for harvested conversations
const HARVESTED_CONVERSATION_CONTEXT = `

## 🔒 THIS JOURNEY HAS BEEN HARVESTED - CRITICAL INSTRUCTIONS

The user has already harvested this journey - it's COMPLETE! The seeds from this journey have been collected.

**You can still:**
- Chat about anything
- Provide emotional support  
- Answer questions about life/philosophy
- Discuss reflections on their completed journey
- Celebrate actions they share

**🚫 ABSOLUTELY NEVER in a harvested conversation:**
- Tell them to "log this" or "plant this seed"
- Mention the "🌱 Plant Seeds" button
- Give them "Name it:" or "Describe it:" suggestions
- Suggest ANY seed-planting or seed-logging activity
- The Plant Seeds button is LOCKED for this journey - do not reference it

**When they share that they helped someone succeed:**
- Celebrate the SEED THEY PLANTED (the act of helping)
- IMPORTANT: The other person's success is NOT the user's harvest! 
- The other person collected THEIR OWN harvest (from seeds they planted before)
- The USER's harvest from helping will come LATER, in its own form
- Example: "Beautiful seed you planted! By helping them succeed, you've planted a powerful seed. Your harvest from this will come in its own time and form."
- DO NOT say "this is your harvest ripening" — it's a seed planted, not a harvest received

**When they share their OWN success/good news:**
- This IS their harvest ripening from past seeds
- Celebrate it as such
- Help them reflect on what seeds they might have planted that led to this

**This is a REFLECTION space, not a planting space.**

**⚠️ If they ask for NEW SEEDS or want to track something new:**
- "How do I...?", "What should I do...?", "I want to...", "What seeds should I plant for...?"

**You MUST redirect them to start a NEW JOURNEY:**

"This sounds like a new journey! 🌱

This journey is complete - you've harvested your seeds beautifully. But what you're asking about now needs its own journey, its own seeds, its own space to grow.

**Tap the '+' button** to start a fresh journey for this new chapter. I'll help you plant the right seeds there!

(You can always come back here to reflect on this completed journey - it's not going anywhere. 💜)"

**Use the word "journey" for conversations, and "seeds" for actions they plant.**`;

// ===================
// DIRECT CHAT INTENT GATING
// ===================

// Explicitly asking for support/comfort/venting (keep NARROW so new problems/goals don't get misclassified).
const SUPPORT_INTENT_PATTERN =
  /(^|\b)(i (?:just )?(?:need|want) (?:support|comfort|encouragement|reassurance)|support|motivat(e|ion)|encourag(e|ement)|pep talk|reassur(e|ance)|comfort|vent|listen)\b|(^|\b)(мне нужна поддержка|мне нужна мотивация|поддержк|мотивац|ободр|успоко|выговор|просто\s+поддерж)\b/i;

// Explicit = steps/advice/seeds (avoid generic "give me", which often appears in support requests)
const EXPLICIT_STEPS_OR_SEEDS_PATTERN =
  /(^|\b)(what should i do|what do i do|tell me what to do|how do i|any advice|steps|step-by-step|plan|roadmap|recommend|suggest|can you tell me|help me (with|do)|give me (advice|steps|a plan|a roadmap|ideas|suggestions)|what seeds|seed|seeds)\b|(^|\b)(что делать|как мне|какие шаги|дай совет|посоветуй|рекоменд|что мне делать|какие семена|семен(а|а?))\b/i;

// Detect when the assistant has actually provided seed RECOMMENDATIONS recently (not just mentioned seeds in the welcome message).
// Keep this pattern NARROW to avoid forcing support-only mode on the first user message.
const RECENT_SEED_ADVICE_PATTERN =
  /(🌱\s|here are some seeds|seeds you could plant|seed actions|specific seeds|tap .*plant seeds|какие семена|вот (?:несколько|пара) семян|семена, которые (?:ты|вы) можешь)/i;

// "Feelings follow-up" messages where user wants reassurance, not new actions.
const FEELINGS_FOLLOWUP_PATTERN =
  /\b(i still feel|still (?:nervous|unsure|anxious|scared)|i'?m still (?:nervous|unsure|anxious|scared)|i'?m afraid|i'?m worried|i don'?t feel ready)\b|(\bвсё ещё\b.*(нервнича|тревож|боюс|страшно|не уверен|сомневаюсь)|\bя (?:всё ещё|по-?прежнему)\b.*(чувствую|волнуюсь|переживаю))/i;

function shouldAllowSeedsInDirectChat(conversationHistory: ChatMessage[], userMessage: string): boolean {
  const text = (userMessage || '').trim();
  const userCount = conversationHistory.filter(m => m.isUser).length;
  // Treat "still nervous/unsure" as support-only ONLY when it's a follow-up (not the first user message).
  const isFeelingsFollowup = userCount > 0 && FEELINGS_FOLLOWUP_PATTERN.test(text);
  const isSupportIntent = SUPPORT_INTENT_PATTERN.test(text) || isFeelingsFollowup;
  const isExplicitStepsOrSeeds = EXPLICIT_STEPS_OR_SEEDS_PATTERN.test(text);

  // Support/motivation/venting should BLOCK seeds unless the user explicitly asks for steps/seeds.
  if (isSupportIntent && !isExplicitStepsOrSeeds) return false;

  // If they explicitly ask for steps/advice/seeds, allow.
  if (isExplicitStepsOrSeeds) return true;

  // If we already gave seed advice recently and they aren't explicitly asking for more, block.
  // IMPORTANT: Only apply this after at least one prior user message (so the welcome message can't trigger it).
  const recentAssistantMsgs = conversationHistory.filter(m => !m.isUser).slice(-4);
  const hasRecentSeedAdvice =
    userCount > 0 && recentAssistantMsgs.some(m => RECENT_SEED_ADVICE_PATTERN.test(m.text));
  if (hasRecentSeedAdvice) return false;

  // Default: allow seeds (the prompt will still ask clarifying questions first if vague).
  return true;
}

// Direct-chat support mode: keep SeedMind vibe, but avoid prescribing actions.
const DIRECT_CHAT_SUPPORT_PROMPT = `You are the SeedMind Guide — warm, wise, supportive.

The user is asking for emotional support, reassurance, or sharing feelings (often after prior advice).

RULES:
- Validate and comfort (2–10 sentences).
- Keep language grounded and human (no poetic metaphors).
- DO NOT give new action steps, homework, or "go do X" instructions.
- DO NOT use seed lists (no 🌱 bullets), no "Seed for today", no prescriptions.
- DO NOT mention the mirror principle explicitly, the Garden tab, logging/Plant Seeds button, Harvest, or Coffee Meditations.
- Ask at most ONE concrete question (optional).
- Never ask self-care filler questions like “what small kind thing can you do for yourself today?”.
- No markdown formatting.`;

// Direct chat first reply (new conversation): prioritize presence + one clarifying question.
// This avoids jumping into "seed logic" too fast and prevents "answer and I'll give you seeds" phrasing.
const DIRECT_CHAT_CLARIFYING_PROMPT = `You are the SeedMind Guide — warm, wise, deeply supportive.

This is the FIRST assistant reply in a new conversation. The user just shared a situation or problem.

RULES (CRITICAL):
- Start with real emotional support/validation (4–8 sentences). Be present, human, and specific. Use a few warm emojis naturally (💜✨🌿) — not spam.
- Include exactly ONE mirror line (one sentence) after the support, using this meaning:
  "When we think in seeds, what you do now can change what you experience next."
- Then ask EXACTLY ONE clarifying question at the end using this exact style:
  "To help me support you best, tell me one thing: <your question>"
- Do NOT promise seeds or say anything like "Answer and I'll give you seeds."
- Do NOT mention the mirror principle explicitly, the Garden tab, Plant Seeds button, Harvest, or Coffee Meditations.
- No markdown formatting.`;

// Send message in Direct Chat mode (natural, mentor-style conversation)
export const sendDirectChatMessage = async (
  conversationHistory: ChatMessage[],
  userMessage: string,
  isHarvested: boolean = false,
  context?: {
    category?: string;
    includePastSeeds?: boolean;
    forceFinal?: boolean;
    intent?: DirectChatIntent;
    inJourneyContext?: boolean;
  }
): Promise<string> => {
  const trimmedHistory = prepareHistoryForApi(conversationHistory, userMessage);

  // Build system prompt - add harvested context if conversation is harvested, plus language instruction
  const languageInstruction = getLanguageInstruction();
  // Niche-first chat: always use the same free-flowing system prompt.
  // (We keep the "harvested" context in case other parts of the app still mark chats harvested.)
  const systemPrompt = isHarvested
    ? DIRECT_CHAT_SYSTEM_PROMPT + HARVESTED_CONVERSATION_CONTEXT + languageInstruction
    : DIRECT_CHAT_SYSTEM_PROMPT + languageInstruction;
  const karmicPartnerKnowledge = getKarmicPartnerKnowledgeOrNull(userMessage);

  const apiMessages: Message[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'system',
      content: buildMemorySummary(conversationHistory, userMessage, {
        category: context?.category,
        includePastSeeds: false,
        forceFinal: false,
        isHarvested,
        intent: context?.intent,
        inJourneyContext: context?.inJourneyContext,
      }),
    },
    ...(karmicPartnerKnowledge ? [{ role: 'system' as const, content: karmicPartnerKnowledge }] : []),
  ];
  trimmedHistory.forEach(msg => {
    apiMessages.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text,
    });
  });

  const callOnce = async (): Promise<string> => {
    const bearer = await getAuthBearerForDeepSeek();
    const extra = await getProxyExtraHeaders({ consumeMessage: true });
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
        ...extra,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: apiMessages,
        temperature: context?.forceFinal ? 0.2 : 0.85,
        max_tokens: 1200,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      const retryAfter = response.headers?.get?.('Retry-After') || '';
      const text = await response.text().catch(() => '');
      const err: any = new Error(`API_REQUEST_FAILED_${response.status}`);
      err.status = response.status;
      err.retryAfterSeconds = retryAfter ? Number(retryAfter) : undefined;
      err.body = text?.slice?.(0, 800) || '';
      throw err;
    }
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('INVALID_RESPONSE');
    return sanitizeResponse(data.choices[0].message.content);
  };

  // Retry once on transient failures (auth propagation, brief rate limits, upstream hiccups).
  const tryWithRetry = async (): Promise<string> => {
    try {
      return await callOnce();
    } catch (e: any) {
      const status = Number(e?.status || 0);
      const retryAfterSeconds = Number(e?.retryAfterSeconds || 0);
      const msg = String(e?.message || '');

      // Small wait for auth propagation (AUTH_REQUIRED) or retry-after (429) or 5xx.
      if (msg.includes('AUTH_REQUIRED')) {
        await sleep(400);
        return await callOnce();
      }
      // RN fetch can throw without a status when the network briefly blips.
      if (status === 0 && /network request failed|failed to fetch/i.test(msg)) {
        await sleep(650);
        return await callOnce();
      }
      if (status === 429) {
        await sleep(Math.min(2000, Math.max(500, retryAfterSeconds * 1000 || 800)));
        return await callOnce();
      }
      if (status >= 500 && status < 600) {
        await sleep(650);
        return await callOnce();
      }
      // Non-retriable: rethrow.
      throw e;
    }
  };

  try {
    return await tryWithRetry();
  } catch (error: any) {
    // IMPORTANT: Avoid a misleading “empathetic” fallback that looks like a real AI reply.
    // If something is wrong, say so plainly so the user can retry (or sign in again).
    const status = Number(error?.status || 0);
    if (status === 401) {
      return "You're signed out. Please sign in again, then retry your message.";
    }
    if (status === 402 && String(error?.body || '').includes('free_limit_reached')) {
      return "You’ve reached the free message limit for this cycle. Please upgrade to continue.";
    }
    if (status === 429) {
      return "I'm getting too many requests right now. Please wait a moment and try again.";
    }
    console.error('DeepSeek Direct Chat Error:', error);
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
};

type StreamDeltaHandler = (deltaText: string) => void;

async function readSseStream(
  response: Response,
  onDelta: StreamDeltaHandler
): Promise<string | null> {
  // Some runtimes (older RN/Hermes) don't expose streaming bodies.
  const body: any = (response as any)?.body;
  if (!body || typeof body.getReader !== 'function') return null;

  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  let full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process line-by-line. SSE typically uses "data: ..." lines.
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (!payload) continue;
      if (payload === '[DONE]') return full;

      try {
        const json = JSON.parse(payload);
        const delta =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.delta?.text ??
          '';
        if (typeof delta === 'string' && delta.length) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }

  return full || null;
}

export const sendDirectChatMessageStream = async (
  conversationHistory: ChatMessage[],
  userMessage: string,
  isHarvested: boolean,
  context: {
    category?: string;
    intent?: DirectChatIntent;
    inJourneyContext?: boolean;
  } | undefined,
  onDelta: StreamDeltaHandler,
  control?: {
    registerCancel?: (cancel: () => void) => void;
    isCancelled?: () => boolean;
  }
): Promise<string> => {
  const trimmedHistory = prepareHistoryForApi(conversationHistory, userMessage);

  const languageInstruction = getLanguageInstruction();
  const systemPrompt = isHarvested
    ? DIRECT_CHAT_SYSTEM_PROMPT + HARVESTED_CONVERSATION_CONTEXT + languageInstruction
    : DIRECT_CHAT_SYSTEM_PROMPT + languageInstruction;
  const karmicPartnerKnowledge = getKarmicPartnerKnowledgeOrNull(userMessage);

  const apiMessages: Message[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'system',
      content: buildMemorySummary(conversationHistory, userMessage, {
        category: context?.category,
        includePastSeeds: false,
        forceFinal: false,
        isHarvested,
        intent: context?.intent,
        inJourneyContext: context?.inJourneyContext,
      }),
    },
    ...(karmicPartnerKnowledge ? [{ role: 'system' as const, content: karmicPartnerKnowledge }] : []),
    ...trimmedHistory.map(
      (msg): Message => ({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.text,
      })
    ),
  ];

  const callOnce = async (opts: {
    max_tokens: number;
    temperature: number;
    top_p: number;
    extraSystem?: string;
    postProcess?: boolean;
  }): Promise<string> => {
    const msgs = opts.extraSystem
      ? [...apiMessages, { role: 'system' as const, content: opts.extraSystem }]
      : apiMessages;
    const bearer = await getAuthBearerForDeepSeek();
    const extra = await getProxyExtraHeaders({ consumeMessage: true });
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
        ...extra,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: msgs,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        top_p: opts.top_p,
      }),
    });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data: any = await response.json();
    const raw = sanitizeResponse(data?.choices?.[0]?.message?.content || '');
    return opts.postProcess === false ? raw : postProcessDirectChatText(raw);
  };

  try {
    let firstDeltaResolved = false;
    let firstDeltaResolve: (() => void) | null = null;
    const firstDeltaPromise = new Promise<void>((resolve) => {
      firstDeltaResolve = resolve;
    });

    type Writer = 'unset' | 'sse' | 'fetch_sse' | 'fallback';
    let writer: Writer = 'unset';

    // Cancellation support (Stop generating)
    let cancelRequested = false;
    let activeCancel: null | (() => void) = null;
    const isCancelled = () => cancelRequested || (control?.isCancelled?.() ?? false);
    try {
      control?.registerCancel?.(() => {
        cancelRequested = true;
        try {
          activeCancel?.();
        } catch {
          // ignore
        }
      });
    } catch {}

    const onDeltaFrom = (source: Writer, deltaText: string) => {
      if (!deltaText) return;
      if (isCancelled()) return;
      if (writer === 'unset') writer = source;
      if (writer !== source) return;
      if (!firstDeltaResolved) {
        firstDeltaResolved = true;
        firstDeltaResolve?.();
      }
      onDelta(deltaText);
    };

    const createPacedDeltaEmitter = (opts: {
      source: Writer;
      tickMs: number;
      maxCharsPerTick: number;
    }) => {
      const toGraphemes = (input: string): string[] => {
        const s = String(input || '');
        if (!s) return [];
        try {
          const Seg: any = (Intl as any)?.Segmenter;
          if (typeof Seg === 'function') {
            const seg = new Seg(undefined, { granularity: 'grapheme' });
            return Array.from(seg.segment(s), (x: any) => String(x.segment));
          }
        } catch {
          // ignore
        }
        // Fallback: codepoints (better than UTF-16 slices; may still split some ZWJ sequences).
        return Array.from(s);
      };

      let q: string[] = [];
      let ticking = false;
      let finished = false;
      let drainResolve: (() => void) | null = null;
      const drainPromise = new Promise<void>((resolve) => {
        drainResolve = resolve;
      });

      const tickOnce = () => {
        if (q.length === 0) {
          ticking = false;
          if (finished) drainResolve?.();
          return;
        }

        const n = Math.max(6, opts.maxCharsPerTick);
        const chunkArr = q.slice(0, n);
        q = q.slice(n);
        onDeltaFrom(opts.source, chunkArr.join(''));

        setTimeout(tickOnce, Math.max(24, opts.tickMs));
      };

      const ensureTicking = () => {
        if (ticking) return;
        ticking = true;
        setTimeout(tickOnce, 0);
      };

      const enqueue = (t: string) => {
        if (!t) return;
        q.push(...toGraphemes(t));
        ensureTicking();
      };

      const finish = () => {
        finished = true;
        if (!ticking && q.length === 0) drainResolve?.();
      };

      const flushAllNow = () => {
        if (q.length) onDeltaFrom(opts.source, q.join(''));
        q = [];
        finished = true;
        drainResolve?.();
      };

      const cancelNow = () => {
        q = [];
        finished = true;
        drainResolve?.();
      };

      return {
        enqueue,
        finish,
        flushAllNow,
        cancelNow,
        waitForDrain: () => drainPromise,
      };
    };

    const parseDeepSeekDelta = (payload: string): string => {
      try {
        const json = JSON.parse(payload);
        return (
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.delta?.text ??
          ''
        );
      } catch {
        return '';
      }
    };

    const streamViaReactNativeSse = async (): Promise<string> => {
      // Pace the *rendering* so it stays readable even if tokens arrive very fast.
      // This keeps the "continuous typing" feel without overwhelming the reader.
      const emitter = createPacedDeltaEmitter({
        source: 'sse',
        tickMs: 68,
        maxCharsPerTick: 14,
      });
      let full = '';
      let settled = false;
      let gotAny = false;
      const bearer = await getAuthBearerForDeepSeek();
      const extra = await getProxyExtraHeaders({ consumeMessage: true });

      const stripStreamingMarkdown = (t: string) => {
        const s = t || '';
        // Remove common markdown tokens that otherwise show up mid-stream.
        return s
          .replace(/\*\*/g, '')
          .replace(/__/g, '')
          .replace(/`/g, '')
          .replace(/\*/g, '')
          .replace(/_/g, '');
      };

      // IMPORTANT: Do not inject emojis during streaming.
      // Injecting later makes emojis "pop in" after the message finishes.
      const enhanceStreamingText = (incoming: string): string => stripStreamingMarkdown(incoming || '');

      return await new Promise<string>((resolve, reject) => {
        const body = JSON.stringify({
          model: 'deepseek-chat',
          messages: apiMessages,
          temperature: 0.85,
          max_tokens: 1200,
          top_p: 0.9,
          stream: true,
        });

        const es = new EventSource(getDeepSeekApiUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Authorization: `Bearer ${bearer}`,
            ...extra,
          },
          body,
          pollingInterval: 0,
          timeout: 0,
          timeoutBeforeConnection: 0,
          lineEndingCharacter: '\n',
          debug: typeof __DEV__ !== 'undefined' && __DEV__,
        });

        const cleanup = () => {
          // Don't force-flush here; we want a smooth finish without a final "blurt".
          try {
            es.removeAllEventListeners();
          } catch {}
          try {
            es.close();
          } catch {}
        };

        const settleCancel = async () => {
          if (settled) return;
          settled = true;
          clearTimeout(firstTokenTimer);
          cleanup();
          // Drop any queued paced text so cancellation is immediate.
          emitter.cancelNow();
          resolve('');
        };

        // Allow ChatScreen to cancel this stream (Stop button).
        activeCancel = () => {
          void settleCancel();
        };

        const settleResolve = async (text: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          // Wait until the paced queue finishes emitting before resolving,
          // so ChatScreen doesn't overwrite the bubble with "final text" early.
          emitter.finish();
          await emitter.waitForDrain();
          resolve(text);
        };
        const settleReject = (err: any) => {
          if (settled) return;
          settled = true;
          cleanup();
          emitter.flushAllNow();
          reject(err);
        };

        // If no tokens arrive quickly, abort and fall back.
        // Cold start / resumed app often needs longer for TLS, auth refresh, and SSE connect.
        const FIRST_TOKEN_MS = 12000;
        const firstTokenTimer = setTimeout(() => {
          if (!gotAny) {
            settleReject(new Error('SSE_NO_FIRST_TOKEN'));
          }
        }, FIRST_TOKEN_MS);

        const listener: EventSourceListener = (event: any) => {
          if (settled) return;
          if (isCancelled()) {
            void settleCancel();
            return;
          }
          const t = event?.type;

          if (t === 'open') {
            return;
          }

          if (t === 'message') {
            const data = event?.data;
            if (!data) return;
            if (data === '[DONE]') {
              clearTimeout(firstTokenTimer);
              // Do not post-process streamed text (no late emoji insertions / no end-of-stream rewrites).
              void settleResolve(sanitizeResponse(full));
              return;
            }

            const delta = parseDeepSeekDelta(data);
            if (typeof delta === 'string' && delta.length) {
              gotAny = true;
              clearTimeout(firstTokenTimer);
              const enhanced = enhanceStreamingText(delta);
              full += enhanced;
              emitter.enqueue(enhanced);
            }
            return;
          }

          if (t === 'done') {
            clearTimeout(firstTokenTimer);
            void settleResolve(sanitizeResponse(full));
            return;
          }

          if (t === 'error' || t === 'exception') {
            clearTimeout(firstTokenTimer);
            // If we already have content, return what we have instead of hard-failing.
            if (full.trim()) {
              void settleResolve(sanitizeResponse(full));
              return;
            }
            settleReject(new Error(event?.message || 'SSE_ERROR'));
          }
        };

        es.addEventListener('open', listener);
        es.addEventListener('message', listener);
        // 'done' is supported by react-native-sse, but not included in the default TS event union.
        (es as any).addEventListener('done', listener);
        es.addEventListener('error', listener as any);
      });
    };

    const streamViaFetchSse = async (): Promise<string> => {
      const bearer = await getAuthBearerForDeepSeek();
      const extra = await getProxyExtraHeaders({ consumeMessage: true });
      const response = await fetch(getDeepSeekApiUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${bearer}`,
          ...extra,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: apiMessages,
          temperature: 0.85,
          max_tokens: 1200,
          top_p: 0.9,
          stream: true,
        }),
      });

      if (!response.ok) throw new Error(`API request failed: ${response.status}`);
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('text/event-stream')) throw new Error('NOT_SSE');

      const streamed = await readSseStream(response, (d) => {
        onDeltaFrom('fetch_sse', d);
      });
      if (!streamed) throw new Error('NO_STREAM');
      // Do not post-process streamed text (avoids emoji pop-in after completion).
      return sanitizeResponse(streamed);
    };

    const fastFirstFallback = async (): Promise<string> => {
      // Lock to fallback so late SSE events can't append/duplicate.
      writer = 'fallback';
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[SeedMind] Streaming unavailable → fast-first fallback.');
      }
      if (isCancelled()) return '';

      const normalizeForDedupe = (s: string) =>
        (s || '')
          .replace(EMOJI_GLOBAL_RE, '')
          .toLowerCase()
          .replace(/[`"'“”‘’]/g, '')
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const splitParagraphs = (s: string) =>
        (s || '')
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean);

      const emitWordChunks = async (text: string, opts?: { wordsPerChunk?: number; delayMs?: number }) => {
        const t = (text || '').trim();
        if (!t) return;
        const words = t.split(/(\s+)/);
        const wordsPerChunk = Math.max(4, Math.min(12, opts?.wordsPerChunk ?? 6));
        const delayMs = Math.max(32, Math.min(110, opts?.delayMs ?? 52));

        let i = 0;
        while (i < words.length) {
          if (isCancelled()) return;
          const take = wordsPerChunk * 2; // includes whitespace tokens
          const chunk = words.slice(i, i + take).join('');
          i += take;
          if (chunk) onDeltaFrom('fallback', chunk);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, delayMs));
        }
      };

      const draftRaw = await callOnce({
        max_tokens: 190,
        temperature: 0.85,
        top_p: 0.9,
        postProcess: false,
        extraSystem:
          'FAST DRAFT: Start answering immediately. Keep it to 4–7 short lines. Use varied emojis (not 🌱 spam). Do NOT include an “If you want…” line yet. Do not use headings.',
      }).catch(() => '');
      if (isCancelled()) return '';
      const draftShown = draftRaw ? postProcessDirectChatText(draftRaw) : '';
      if (draftShown) await emitWordChunks(draftShown, { wordsPerChunk: 6, delayMs: 48 });
      if (isCancelled()) return '';

      const continuationRaw = await callOnce({
        max_tokens: 820,
        temperature: 0.8,
        top_p: 0.9,
        postProcess: false,
        extraSystem: draftShown
          ? `CONTINUE: Continue the answer from the draft below. Do NOT repeat the draft. Add more helpful detail and practical seeds if relevant. Use varied emojis (not 🌱 spam). End with exactly ONE “If you want…” line.\n\nDRAFT:\n${draftShown}`
          : 'CONTINUE: Write the full reply now. Use varied emojis (not 🌱 spam). End with exactly ONE “If you want…” line.',
      });
      if (isCancelled()) return '';

      let continuation = (continuationRaw || '').trimStart();
      const draftNorm = (draftShown || '').trim();
      if (draftNorm && continuation.startsWith(draftNorm)) {
        continuation = continuation.slice(draftNorm.length).trimStart();
      }
      continuation = stripRedundantDraftPrefix(draftShown, continuation);

      // Paragraph-level dedupe: drop any continuation paragraphs that match the draft (normalized).
      const draftParas = splitParagraphs(draftShown);
      const draftParaSet = new Set(
        draftParas.map((p) => normalizeForDedupe(p)).filter((p) => p.length >= 18)
      );
      const contParas = splitParagraphs(continuation);
      const contFiltered = contParas.filter((p) => {
        const n = normalizeForDedupe(p);
        if (n.length < 18) return true;
        return !draftParaSet.has(n);
      });
      continuation = contFiltered.join('\n\n').trim();

      const combinedRaw = (draftShown ? `${draftShown}\n\n${continuation}` : continuation).trim();
      const finalText = postProcessDirectChatText(combinedRaw);

      // Stream the deduped continuation only; ChatScreen replaces with finalText when done.
      if (draftShown && continuation.trim()) {
        await emitWordChunks(continuation.trim(), { wordsPerChunk: 6, delayMs: 52 });
      }

      return finalText;
    };

    // Preferred path: real SSE tokens (ChatGPT-like).
    if (Platform.OS !== 'web') {
      try {
        return await streamViaReactNativeSse();
      } catch {
        return await fastFirstFallback();
      }
    }

    // Web path: use fetch streaming if available.
    try {
      return await streamViaFetchSse();
    } catch {
      return await fastFirstFallback();
    }
  } catch (e) {
    // Final safety fallback.
    const out = await sendDirectChatMessage(conversationHistory, userMessage, isHarvested, context as any);
    return postProcessDirectChatText(out);
  }
};

// Send message specifically for post-completion emotional support chat
export const sendPostCompletionMessage = async (
  conversationHistory: ChatMessage[],
  userMessage: string
): Promise<string> => {
  const trimmedHistory = prepareHistoryForApi(conversationHistory, userMessage);

  // Use simpler post-completion prompt
  const apiMessages: Message[] = [
    { role: 'system', content: POST_COMPLETION_SYSTEM_PROMPT },
    { role: 'system', content: buildMemorySummary(conversationHistory, userMessage, { isHarvested: true }) },
  ];
  trimmedHistory.forEach(msg => {
    apiMessages.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    });
  });

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: apiMessages,
        temperature: 0.8,
        max_tokens: 1000, // Enough for detailed answers when user asks questions
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    return sanitizeResponse(data.choices[0].message.content);
  } catch (error) {
    console.error('DeepSeek Post-Completion Error:', error);
    return "I hear you. Remember, change takes time - seeds don't bloom overnight. Keep watering them with your meditations. 💜";
  }
};

// Detect if user is acknowledging past action (Phase 3 trigger)
const isAcknowledgment = (msg: string): boolean => {
  const lower = msg.toLowerCase();
  const triggers = [
    'yeah', 'yes actually', 'actually', 'i did', 'i remember', 'there was', 
    'i think i', 'maybe i', 'i guess', 'probably when', 'i wasn\'t there',
    'i didn\'t help', 'i didn\'t share', 'i didn\'t', 'a friend asked', 
    'someone needed', 'someone asked', 'i could have', 'i should have', 
    'i never', 'i forgot to', 'i was jealous', 'i felt jealous',
    'i took credit', 'i didn\'t acknowledge', 'i left them'
  ];
  return triggers.some(t => lower.includes(t));
};

// Detect if message contains a problem category
const hasProblemCategory = (msg: string): boolean => {
  const lower = msg.toLowerCase();
  const categoryKeywords = [
    'money', 'financial', 'broke', 'debt', 'bills', 'afford', 'salary', 'income',
    'lonely', 'alone', 'isolated', 'no friends', 'no one',
    'relationship', 'love', 'partner', 'dating', 'marriage', 'boyfriend', 'girlfriend', 'single',
    'career', 'job', 'work', 'promotion', 'boss', 'colleague',
    'anxiety', 'anxious', 'stressed', 'peace', 'calm', 'overwhelmed',
    'health', 'sick', 'tired', 'pain', 'body', 'energy'
  ];
  return categoryKeywords.some(k => lower.includes(k));
};

// Detect pure emotional response (feelings only, no problem category)
const isPureEmotionalResponse = (msg: string): boolean => {
  const lower = msg.toLowerCase();
  const emotionalWords = [
    'feel', 'feeling', 'stressed', 'worried', 'anxious', 'scared',
    'frustrated', 'angry', 'sad', 'overwhelmed', 'exhausted', 'hopeless',
    'stuck', 'lost', 'broken', 'falling apart', 'collapsing', 'heavy',
    'pressure', 'painful', 'fear', 'frustration', 'exhaustion'
  ];
  const hasEmotion = emotionalWords.some(w => lower.includes(w));
  const hasCategory = hasProblemCategory(lower);
  
  // Pure emotional = has emotion words but NO problem category
  return hasEmotion && !hasCategory;
};

// Get the problem category from message
const detectProblemCategory = (msg: string): string => {
  const lower = msg.toLowerCase();
  if (lower.includes('money') || lower.includes('financial') || lower.includes('broke') || lower.includes('debt') || lower.includes('bills') || lower.includes('afford') || lower.includes('salary')) return 'money';
  if (lower.includes('lonely') || lower.includes('alone') || lower.includes('isolated') || lower.includes('no friends') || lower.includes('no one')) return 'loneliness';
  if (lower.includes('relationship') || lower.includes('love') || lower.includes('partner') || lower.includes('dating') || lower.includes('marriage') || lower.includes('boyfriend') || lower.includes('girlfriend') || lower.includes('single')) return 'relationship';
  if (lower.includes('career') || lower.includes('job') || lower.includes('work') || lower.includes('promot') || lower.includes('boss') || lower.includes('colleague')) return 'career';
  if (lower.includes('anxi') || lower.includes('stress') || lower.includes('worried') || lower.includes('peace') || lower.includes('calm') || lower.includes('overwhelm')) return 'peace';
  if (lower.includes('health') || lower.includes('sick') || lower.includes('tired') || lower.includes('pain') || lower.includes('body') || lower.includes('energy')) return 'health';
  return 'general';
};

// Main fallback logic with CORRECT phase detection
const getFallbackResponse = (userMessage: string): string => {
  const lower = userMessage.toLowerCase();
  const category = detectProblemCategory(lower);
  
  // PHASE 3: User acknowledges past action
  // "yeah", "actually", "I did", "a friend asked", etc.
  if (isAcknowledgment(lower)) {
    return getPhase3And4Response(category);
  }
  
  // PHASE 2: Pure emotional response (feelings only, NO problem category)
  // "I feel stressed and worried" (no career/money/etc mentioned)
  if (isPureEmotionalResponse(lower)) {
    return getPhase2Response(category);
  }
  
  // PHASE 1: Initial problem statement (has a problem category)
  // "I'm struggling with money", "I feel stuck in my career", etc.
  return getPhase1Response(category);
};

// Phase 1: Emotional support + one feeling question (warm, psychologist-like)
const getPhase1Response = (category: string): string => {
  const responses: Record<string, string> = {
    money: `I really hear you... financial stress has this way of touching everything, doesn't it? That constant worry in the background, the tightness in your chest when bills arrive, maybe even feeling like you should be so much further along by now.

You're not alone in this, and it makes complete sense that you're struggling. This weight you're carrying is real.

What's the strongest feeling right now - is it fear, frustration, exhaustion, or something else entirely?`,

    loneliness: `That feeling of loneliness... I want you to know it's one of the most painful human experiences there is. That sense of being somehow invisible, even when you're surrounded by people. Like there's this glass wall between you and everyone else that nobody can see.

You deserve connection, and it makes sense that this hurts so much.

How does it feel for you most days - invisible, forgotten, disconnected, or something else?`,

    relationship: `Relationships can bring such deep pain when they're not working the way we hope... that exhausting cycle of trying and trying, giving so much, but something's just not clicking. It takes so much out of you.

Your heart clearly wants love - that's beautiful, not a weakness.

What's been the hardest part emotionally - feeling unloved, misunderstood, alone in it?`,

    career: `That feeling of being stuck while watching others move forward... putting in the effort, showing up every day, but somehow staying in place while others get recognized. It's so frustrating and genuinely exhausting.

Your ambition and desire to grow are good things. This struggle doesn't mean something's wrong with you.

What feeling comes up strongest - undervalued, trapped, invisible, or something else?`,

    peace: `That constant hum of stress, never being able to settle into true calm... it's absolutely exhausting. Like your nervous system won't give you a break, always spinning, always on alert for the next thing.

You deserve peace. You really do.

What does it feel like inside? What thoughts or worries are loudest right now?`,

    health: `I'm really sorry you're going through health challenges. When your body isn't cooperating, everything feels harder - it affects your mood, your energy, your relationships, your whole life. And it can feel so isolating, like nobody quite understands.

Your struggle is real and valid.

What's been the hardest part of this for you?`,

    general: `I hear that you're going through something difficult, and I want you to know that what you're feeling is completely valid. Sometimes life just gets heavy.

Tell me more - what's weighing on you the most right now?`
  };
  return responses[category] || responses.general;
};

// Phase 2: Exploration with category-specific seed examples (gentle, mirror principle)
// KEY: You experience X because you CAUSED X to others (direct causation)
const getPhase2Response = (category: string): string => {
  const responses: Record<string, string> = {
    money: `I want to share something with you that might help make sense of what's happening.

Life works like a mirror - we experience what we've caused others to experience. Not as punishment, but as natural cause and effect.

Think back gently - maybe recently, or maybe years ago. Did you ever take money that wasn't fully yours? Keep money you should have shared? When someone asked for financial help, did you refuse even though you could have helped? Did you not pay someone what they deserved? Feel jealous when others got money instead of genuinely happy for them?

There's no judgment here - I'm asking because the seed for not having money is usually taking or withholding it from others.`,

    loneliness: `I want to share something with you that might help make sense of this.

Life works like a mirror - we experience what we've caused others to experience. Not as punishment, but as natural cause and effect.

Think back gently. Did you ever make someone feel excluded or left out? Ignore someone who wanted to connect? Leave someone on read when they reached out? Not invite someone who was alone? Make someone feel invisible or unwanted? Ghost a friend?

No judgment at all - I'm asking because the seed for feeling lonely is usually making others feel lonely.`,

    relationship: `I want to share something with you that might bring some clarity.

Life works like a mirror - we experience what we've caused others to experience. Not as punishment, but as natural cause and effect.

Think back gently. Did you ever harm someone's experience of love? Come between people or break up a relationship? Make someone feel unloved or unwanted? Withhold affection from someone who needed it? Gossip negatively about someone's partner? Feel jealous of happy couples instead of genuinely happy for them?

No judgment - I'm asking because the seed for relationship struggles is usually harming others' experience of love.`,

    career: `I want to share something with you that might help make sense of this.

Life works like a mirror - we experience what we've caused others to experience. Not as punishment, but as natural cause and effect.

Think back. Did you ever take credit for someone else's work? Block someone's promotion or opportunity? Speak badly about a colleague? Feel bitter instead of celebrating when someone succeeded? Not give praise when someone clearly deserved it?

No judgment - I'm asking because the seed for not being recognized is usually not recognizing others.`,

    peace: `I want to share something with you that might bring some understanding.

Life works like a mirror - we experience what we've caused others to experience. Not as punishment, but as natural cause and effect.

Think back gently. Did you ever cause stress for someone else? Pressure someone with demands or deadlines? Annoy or irritate someone repeatedly? Add to someone's burden when they were already overwhelmed? Criticize someone harshly? Make someone's life harder when they were already stretched thin?

No judgment - I'm asking because the seed for feeling stressed is usually causing stress in others.`,

    health: `I want to share something with you that might help make sense of what you're experiencing.

Life works like a mirror - we experience what we've caused others to experience. Not as punishment, but as natural cause and effect.

Think back. Did you ever harm someone else's wellbeing? Cause someone physical pain or discomfort? Be careless with someone's health or safety? Make someone's illness or recovery harder? Were you impatient with someone who was unwell, or ignore someone who was suffering?

No judgment - I'm asking because the seed for health struggles is usually harming others' wellbeing.`,

    general: `I want to share something with you that might help make sense of what's happening.

Life works like a mirror - we experience what we've caused others to experience. Not as punishment, but as natural cause and effect.

Think back gently - maybe recently, or maybe years ago. Can you think of a time when you caused someone else to feel the way you're feeling now? When you made someone experience this same kind of struggle or pain?

No judgment at all - understanding that we planted seeds is actually incredibly empowering. It means we have the power to plant something different.`
  };
  return responses[category] || responses.general;
};

// Phase 3 + 4: The "Aha!" connection + seed options
// KEY: The connection is DIRECT - you caused X, now you experience X
const getPhase3And4Response = (category: string): string => {
  const responses: Record<string, string> = {
    money: `Do you see the connection? When you took or withheld money, you created that experience of "not having" for someone else. That feeling of scarcity, of lack.

And now - that's exactly what you're experiencing. The scarcity you created came back to you.

What you caused is what you're experiencing. Life works like a mirror.

But here's the powerful part: you can plant something different. Which feels right for you today?

🌱 **Give money generously to someone in need**
They'll feel abundance. That generosity will mirror back as money flowing to you.

🌱 **Pay someone more than they expected**
They'll feel valued. That generosity will come back multiplied.

🌱 **Buy someone's coffee or lunch unexpectedly**
They'll feel that warm surprise of receiving. That will mirror back as money appearing unexpectedly.

🌱 **Genuinely celebrate the next person's financial win**
They'll feel celebrated. That "there's enough for everyone" energy will start flowing toward you.

Which one calls to you?`,

    loneliness: `Do you see the connection? When you excluded someone or made them feel invisible, you created that experience of loneliness for them. That ache of not belonging.

And now - that's exactly what you're feeling. The loneliness you caused came back to you.

What you caused is what you're experiencing.

But you can plant something new. Which feels right today?

🌱 **Include someone who looks left out**
They'll feel they belong. That belonging will grow in your life too.

🌱 **Reach out to someone you haven't talked to in a while**
They'll feel remembered and wanted. That will mirror back as people reaching out to you.

🌱 **Really listen to someone today - full presence, no phone**
They'll feel truly seen. That will come back as people truly seeing you.

🌱 **Make someone feel welcome and included**
They'll feel they matter. That connection will surround you too.

Which one?`,

    relationship: `Do you see it? When you harmed someone's experience of love - whether by coming between people, withholding affection, or making someone feel unloved - you created that pain for them.

And now - that's what you're experiencing in your own relationships. The love struggles you caused came back to you.

What you caused is what you're experiencing.

But you can plant new seeds. Which feels right?

🌱 **Show genuine love and affection to someone who needs it**
They'll feel loved. That love will mirror back into your life.

🌱 **Support a couple or help strengthen someone's relationship**
They'll feel supported in love. That relationship positivity will flow toward you.

🌱 **Transform jealousy into genuine happiness for happy couples**
That "love is abundant" feeling will start mirroring back to you.

🌱 **Be a source of love and warmth for someone**
They'll feel cherished. That love will reflect back to you.

Which one?`,

    career: `Do you see the connection? When you took credit, blocked opportunities, or didn't recognize others, you created that experience of being unseen and unrecognized for them.

And now - that's exactly what you're experiencing. The lack of recognition you caused came back to you.

What you caused is what you're experiencing.

But you can change this. Which feels right?

🌱 **Publicly acknowledge someone's great work today**
They'll feel seen and valued. That recognition will start flowing to you.

🌱 **Celebrate someone's success genuinely and vocally**
They'll feel supported. That support will mirror back as people championing you.

🌱 **Give someone a glowing recommendation or referral**
They'll feel valued and helped. Opportunities will start finding their way to you.

🌱 **Share credit generously - give others the spotlight**
They'll feel appreciated. That appreciation will come back to you.

Which one?`,

    peace: `Do you see it? When you caused stress for someone - pressured them, annoyed them, added to their burden - you created that overwhelmed feeling for them.

And now - that's exactly what you're living. The stress you caused came back to you.

What you caused is what you're experiencing.

But you can plant peace. Which feels right?

🌱 **Actively reduce someone's stress today**
They'll feel relief. That calm will mirror back into your own life.

🌱 **Help someone with a task that's overwhelming them**
They'll feel unburdened. That relief will start flowing to you.

🌱 **Be patient and gentle with someone who's struggling**
They'll feel at ease. That peace will come to you.

🌱 **Create calm for someone instead of adding pressure**
They'll feel soothed. That tranquility will grow in your life.

Which one?`,

    health: `Do you see the connection? When you harmed someone's wellbeing - caused them pain, were careless with their health, or made their suffering worse - you created that physical struggle for them.

And now - that's what you're experiencing. The harm to wellbeing you caused came back to you.

What you caused is what you're experiencing.

But you can plant healing. Which feels right?

🌱 **Help someone with their physical wellbeing today**
They'll feel cared for. That care will mirror back to your own health.

🌱 **Be gentle and patient with someone who's unwell**
They'll feel supported. That kindness will reflect in your own body.

🌱 **Actively support someone's healing or recovery**
They'll feel helped. That healing energy will flow back to you.

🌱 **Check on someone who's been struggling with their health**
They'll feel remembered. That care will come back to your own wellbeing.

Which one?`,

    general: `Do you see the connection? The experience you caused for them... is exactly what you're experiencing now. Life reflects back what we give.

But this means you have the power to change it. Which feels right to plant today?

🌱 **Give someone the opposite of what you caused**
They'll experience something good. That will mirror back to you.

🌱 **Be there for someone facing a similar struggle**
They'll feel supported. That support will come to you.

🌱 **Create the experience for someone that you wish you were having**
They'll feel that good feeling. And it will return to you.

Which one calls to you?`
  };
  return responses[category] || responses.general;
};

// Get personalized feeling validation from DeepSeek
// This is used after the user shares their feeling - gives warm, personalized validation
// CRITICAL: This should ONLY return validation, NOT exploration content
export const getFeelingValidationFromDeepSeek = async (
  conversationHistory: ChatMessage[],
  userFeeling: string
): Promise<string> => {
  const validationPrompt = `You are giving a brief, warm validation to someone who just shared their feelings. 

THEIR SITUATION: Look at the conversation history to understand what they're going through.
THEIR FEELING: "${userFeeling}"

YOUR TASK: Give a SHORT (2-3 sentences), warm, personalized validation that:
1. References THEIR SPECIFIC SITUATION (not generic)
2. Echoes back what they're feeling using THEIR words
3. Shows you truly hear them
4. Ends with empathy

⚠️ CRITICAL RULES:
- DO NOT ask any questions
- DO NOT say "think back" or explore past actions
- DO NOT mention seeds, mirrors, or cause-and-effect
- DO NOT give advice
- ONLY give warm validation of their feelings
- Keep it SHORT - max 2-3 sentences

EXAMPLES:
User situation: "bullied at school", feeling: "fear"
✅ GOOD: "Walking into school every day not knowing what's waiting... that fear is so heavy to carry. I hear you, and I'm really sorry you're going through this."

User situation: "can't pay rent", feeling: "stressed"  
✅ GOOD: "Carrying that weight about rent, month after month, never quite feeling safe... that's exhausting in a way people don't always see. I hear how hard this is."

User situation: "no one texts me back", feeling: "lonely"
✅ GOOD: "Reaching out and hearing nothing back... that silence cuts deep. You deserve to feel wanted and seen."

Now give your validation:`;

  const messagesForValidation: Message[] = [
    { role: 'system', content: validationPrompt }
  ];
  
  // Add conversation history for context
  conversationHistory.forEach(msg => {
    messagesForValidation.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    });
  });
  
  // Add the feeling as the last message
  messagesForValidation.push({
    role: 'user',
    content: userFeeling
  });

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messagesForValidation,
        temperature: 0.8,
        max_tokens: 200, // Short response
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    return sanitizeResponse(data.choices[0].message.content);
  } catch (error) {
    console.error('DeepSeek Validation Error:', error);
    // Fallback to a simple validation
    return `I hear you. What you're feeling is so valid, and I'm sorry you're carrying this. You don't have to go through this alone.`;
  }
};

// Generate personalized exploration message based on selected experiences
// Structure stays the same, only the specific questions change
export const getPersonalizedExplorationMessage = async (
  conversationHistory: ChatMessage[],
  selectedExperiences: string[]
): Promise<string> => {
  // If no experiences selected, return the generic exploration message
  if (selectedExperiences.length === 0) {
    return null as any; // Will trigger fallback in ChatScreen
  }

  // Ask DeepSeek to generate ONLY the mirror questions (not the full message)
  const prompt = `Based on these experiences the user is going through:
${selectedExperiences.map(exp => `- "${exp}"`).join('\n')}

Generate ONLY the mirror questions - what they may have done TO OTHERS that mirrors their experiences.

OUTPUT FORMAT (strict JSON only):
{
  "mirrorQuestions": "action1? Maybe action2? Perhaps action3?",
  "seedSummary": "short description of what seeds cause this"
}

**HOW TO CREATE MIRROR QUESTIONS:**
The mirror question asks: "Did YOU ever do this TO SOMEONE ELSE?"
- "I study for hours every day" → "pushed someone too hard to work or study"
- "I don't get enough sleep" → "kept someone up when they needed rest"
- "I have no time for myself" → "didn't give someone the time they needed"
- "People laugh at me" → "laughed at someone"
- "I'm excluded from groups" → "excluded someone from a group"
- "I get called names" → "called someone a name"
- "No one stands up for me" → "stayed quiet when someone needed you to speak up"
- "I feel invisible" → "ignored someone or made them feel invisible"
- "I'm always criticized" → "criticized someone harshly"

**CRITICAL FORMATTING RULES:**
- The FIRST question must NOT start with "Maybe" or "Perhaps" - it flows directly after "when you"
- Only the 2nd, 3rd, 4th questions can start with "Maybe" or "Perhaps"
- Use PAST TENSE verbs (didn't, took, made, kept, etc.)
- Example: "didn't pay someone what you owed? Maybe took something that wasn't yours? Perhaps made someone feel they couldn't afford something?"
- Each question is 5-10 words
- seedSummary: short phrase like "causing others to feel the same way"

Return ONLY valid JSON, no extra text:`;

  const messagesForGeneration: Message[] = [
    { role: 'system', content: prompt }
  ];

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messagesForGeneration,
        temperature: 0.5,
        max_tokens: 200,
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    
    let content = data.choices[0].message.content.trim();
    
    // Parse JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // Construct the message with HARDCODED structure (same as phaseResponses.ts)
    const message = `I want to share something with you that might help make sense of this. Life works like a mirror – we tend to experience what we've caused others to experience. Not as punishment, but as cause and effect.

So I'm curious... can you think back to a time – maybe recently, maybe years ago – when you ${sanitizeResponse(parsed.mirrorQuestions)}

This could be with anyone—family, friends, classmates, strangers, even online. The connection isn't about where or who, it's about the energy you once put out.

There's no judgment here. I'm asking because the seed for what you're experiencing is usually ${sanitizeResponse(parsed.seedSummary)}.`;
    
    return message;
  } catch (error) {
    console.error('DeepSeek Exploration Message Error:', error);
    return null as any; // Will trigger fallback
  }
};

// Interface for personalized seed suggestions
export interface PersonalizedSeed {
  emoji: string;
  action: string;
  theyFeel: string;
  youReceive: string;
  seedType?: 'opportunity' | 'quality'; // opportunity = creates circumstance, quality = shapes what you attract
}

// Interface for the complete personalized content
export interface PersonalizedMirrorAndSeeds {
  mirrorExplanation: string;
  seeds: PersonalizedSeed[];
  reciprocalLaw: string;
}

// Generate seeds specifically for heavy topics (war, disability, deep trauma)
// These skip the "mirror" explanation and focus on future-oriented empowerment
const generateHeavyTopicSeeds = async (
  conversationHistory: ChatMessage[],
  selectedExperiences: string[] = []
): Promise<PersonalizedMirrorAndSeeds> => {
  
  const experiencesContext = selectedExperiences.length > 0
    ? `\nUser specifically mentioned: ${selectedExperiences.map(exp => `"${exp}"`).join(', ')}`
    : '';

  const prompt = `You are generating EMPOWERING seeds for someone facing a HEAVY life situation (war, disability, deep poverty, loss, trauma).

READ THE CONVERSATION to understand their specific situation.${experiencesContext}

⚠️ CRITICAL RULES:
- Do NOT explain WHY this is happening to them
- Do NOT reference past actions or past lives
- Do NOT be preachy or lecture them
- Do NOT generate generic "feel-good" activities

## CRITICAL: TWO TYPES OF SEEDS (INCLUDE BOTH!)

**TYPE 1: OPPORTUNITY SEEDS** (1-2 seeds)
- These CREATE THE CIRCUMSTANCE for change
- They bring new situations, resources, or help INTO their life
- Mark with "seedType": "opportunity"

**TYPE 2: QUALITY SEEDS** (2-3 seeds)
- These shape the QUALITY of what they receive
- They determine HOW support comes, WHAT it feels like
- Mark with "seedType": "quality"

✅ THE CORE PRINCIPLE (MUST FOLLOW):
Seeds must be the DIRECT MIRROR of what they want to receive:
- Want SAFETY → Create SAFETY for others
- Want PEACE → Create PEACE for others (calm conflicts, reduce tensions)
- Want PROTECTION → PROTECT others from harm
- Want HEALING → Help others HEAL
- Want RESOURCES → Share RESOURCES with others
- Want ESCAPE → Help others ESCAPE difficult situations

OUTPUT FORMAT (strict JSON only):
{
  "reciprocalLaw": "Want X? → Create X for others.",
  "mirrorExplanation": "2-3 sentences: (1) how creating X plants seeds of X returning, (2) that conscious intention matters",
  "seeds": [
    {
      "emoji": "🛡️",
      "action": "Short DIRECT action (5-10 words)",
      "theyFeel": "The EXACT feeling user wants (3-6 words)",
      "youReceive": "The SAME thing mirrored back (3-6 words)",
      "seedType": "opportunity"
    }
  ]
}

**EXAMPLES FOR HEAVY TOPICS:**

WAR/DISPLACEMENT:
{
  "reciprocalLaw": "Want safety? → Create safety for others.",
  "mirrorExplanation": "When you consciously protect someone or create safety for them, you plant powerful seeds of protection returning to you. Do it with intention, knowing you're creating safety in your world.",
  "seeds": [
    {"emoji": "🛡️", "seedType": "opportunity", "action": "Help someone escape a dangerous situation", "theyFeel": "rescued and safe", "youReceive": "escape routes opening"},
    {"emoji": "🏠", "seedType": "opportunity", "action": "Connect someone with shelter or refuge", "theyFeel": "safe and sheltered", "youReceive": "safe places appearing"},
    {"emoji": "🕊️", "seedType": "quality", "action": "Help resolve a conflict peacefully", "theyFeel": "peace restored", "youReceive": "peace in your environment"},
    {"emoji": "🤝", "seedType": "quality", "action": "Be a calm presence for someone afraid", "theyFeel": "soothed and steady", "youReceive": "steadiness when afraid"}
  ]
}

DEEP POVERTY:
{
  "reciprocalLaw": "Want resources? → Create resources for others.",
  "mirrorExplanation": "When you consciously open financial doors for others and share what you can, you plant seeds of abundance. Do it with awareness that you're creating flow in your own life.",
  "seeds": [
    {"emoji": "🚪", "seedType": "opportunity", "action": "Help someone find work or income", "theyFeel": "doors opening", "youReceive": "opportunities appearing"},
    {"emoji": "🤝", "seedType": "opportunity", "action": "Connect someone with a helpful resource", "theyFeel": "supported and hopeful", "youReceive": "resources finding you"},
    {"emoji": "💰", "seedType": "quality", "action": "Give generously, even something small", "theyFeel": "financially supported", "youReceive": "generosity flowing to you"},
    {"emoji": "🎁", "seedType": "quality", "action": "Share something valuable freely", "theyFeel": "gifted and valued", "youReceive": "gifts coming your way"}
  ]
}

Generate 4 seeds (1-2 opportunity + 2-3 quality) that are the DIRECT MIRROR of what this person needs:`;

  const messagesForGeneration: Message[] = [
    { role: 'system', content: prompt }
  ];
  
  conversationHistory.forEach(msg => {
    messagesForGeneration.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    });
  });

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messagesForGeneration,
        temperature: 0.7,
        max_tokens: 600,
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    
    const content = data.choices[0].message.content;
    
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    
    return {
      reciprocalLaw: sanitizeResponse(parsed.reciprocalLaw || 'Seeds of kindness create ripples that return to you.'),
      mirrorExplanation: sanitizeResponse(parsed.mirrorExplanation || 'Every seed you plant creates positive energy that flows back into your life.'),
      seeds: (parsed.seeds || []).slice(0, 4).map((seed: any, index: number) => ({
        emoji: seed.emoji || ['🕊️', '💚', '🤝', '✨'][index],
        action: sanitizeResponse(seed.action || 'Do something kind for someone'),
        theyFeel: sanitizeResponse(seed.theyFeel || 'cared for'),
        youReceive: sanitizeResponse(seed.youReceive || 'positive change flowing'),
        seedType: seed.seedType || (index < 2 ? 'opportunity' : 'quality'),
      })),
    };
  } catch (error) {
    console.error('Heavy Topic Seeds Generation Error:', error);
    // Return direct cause-effect fallback with both seed types
    return {
      reciprocalLaw: 'Want safety and peace? → Create safety and peace for others.',
      mirrorExplanation: 'When you consciously protect someone or help them find safety, you plant powerful seeds of protection returning to you. Do it with intention.',
      seeds: [
        { emoji: '🚪', action: 'Help someone escape a difficult situation', theyFeel: 'free and relieved', youReceive: 'escape routes opening', seedType: 'opportunity' as const },
        { emoji: '🤝', action: 'Connect someone with helpful resources', theyFeel: 'supported and hopeful', youReceive: 'help finding you', seedType: 'opportunity' as const },
        { emoji: '🛡️', action: 'Protect someone from harm', theyFeel: 'safe and protected', youReceive: 'protection finding you', seedType: 'quality' as const },
        { emoji: '🕊️', action: 'Help resolve a conflict peacefully', theyFeel: 'peace restored', youReceive: 'peace in your life', seedType: 'quality' as const },
      ],
    };
  }
};

// Generate personalized Mirror explanation and Seed suggestions based on user's specific situation
export const getPersonalizedMirrorAndSeeds = async (
  conversationHistory: ChatMessage[],
  isSkeptical: boolean = false,
  selectedExperiences: string[] = [],
  isHeavyTopic: boolean = false
): Promise<PersonalizedMirrorAndSeeds> => {
  
  // HEAVY TOPIC FLOW: Skip mirror, focus on empowering future-focused seeds
  if (isHeavyTopic) {
    return generateHeavyTopicSeeds(conversationHistory, selectedExperiences);
  }
  
  // Use softer language for skeptical users who clicked "Let me think about this..."
  const mirrorLanguageGuide = isSkeptical
    ? `**CRITICAL: The user is SKEPTICAL (they couldn't think of a past action). Use VERY SOFT language:**
- Use "might've" instead of "made" (e.g., "When you might've made someone feel...")
- Use "could've" for feelings (e.g., "that person could've felt...")
- Be gentle and inviting, not accusatory
- Frame it as a possibility, not a certainty`
    : `**CRITICAL: Use "could've felt" instead of "felt" to be inviting, not accusatory.**`;

  const mirrorExplanationExample = isSkeptical
    ? `"mirrorExplanation": "When you might've made someone feel [specific feeling], even unintentionally, that person could've felt [specific feeling]. And now – that could be exactly what you're experiencing: [their current feeling]. The feeling you gave tends to come back."`
    : `"mirrorExplanation": "When you [specific past action matching their situation], that person could've felt [specific feeling]. And now – that's exactly what you're experiencing: [their current feeling]. The feeling you gave is the feeling that came back."`;

  // Include selected experiences in the prompt if available
  const experiencesContext = selectedExperiences.length > 0
    ? `\n\n**CRITICAL - USER'S SELECTED EXPERIENCES:**
The user specifically selected these experiences they're going through:
${selectedExperiences.map(exp => `- "${exp}"`).join('\n')}

USE THESE EXACT EXPERIENCES to:
1. Create the mirror explanation - reference these specific feelings/experiences
2. Generate seeds that DIRECTLY address these experiences
3. Make the reciprocal law match what they're experiencing

For example, if they selected "People laugh at me", the mirror should mention laughing at others, and seeds should be about protecting others from being laughed at.`
    : '';

  const prompt = `You are analyzing a conversation to generate a personalized "Mirror" explanation and "Seed" suggestions based on the user's SPECIFIC situation.

READ THE CONVERSATION CAREFULLY to understand:
1. What specific problem the user is facing (e.g., bullying, money troubles, loneliness, exam stress)
2. What emotions they're feeling
3. Any specific details they've shared${experiencesContext}

YOUR TASK: Generate a JSON response with personalized content that DIRECTLY addresses their situation.

${mirrorLanguageGuide}

OUTPUT FORMAT (strict JSON):
{
  "reciprocalLaw": "Want X? → Give X to others." (one short sentence showing the reciprocal principle for their goal),
  ${mirrorExplanationExample},
  "seeds": [
    {
      "emoji": "🛡️",
      "action": "Short, specific action (5-10 words max)",
      "theyFeel": "Short feeling (3-6 words)",
      "youReceive": "Short result (3-6 words)"
    }
  ]
}

**RULES FOR MIRROR EXPLANATION:**
- ${isSkeptical ? 'Use "might\'ve made someone feel" - be very gentle since user is skeptical' : 'Use "could\'ve felt" not "felt" - be inviting, not accusatory'}
- Reference their SPECIFIC situation
- Show the direct cause-effect connection
- Keep it to 2-3 sentences max

**CRITICAL: TWO TYPES OF SEEDS (YOU MUST INCLUDE BOTH!)**

**TYPE 1: OPPORTUNITY SEEDS** (MUST have 1-2)
- These CREATE THE CIRCUMSTANCE for change to happen
- They bring new situations, people, or openings INTO their life
- Mark with "seedType": "opportunity"

Examples:
- Money: "Help someone find a job" → Financial opportunities appear
- Loneliness: "Introduce two people who should meet" → Social opportunities appear
- Career: "Recommend someone for an opportunity" → Career doors open

**TYPE 2: QUALITY SEEDS** (MUST have 2-3)
- These shape the QUALITY of what they experience
- They change HOW people treat them, WHAT they attract
- Mark with "seedType": "quality"

Examples:
- Money: "Give generously without strings" → Generous abundance
- Loneliness: "Listen with full presence" → People who truly listen
- Career: "Celebrate others' wins genuinely" → Genuine support

**RULES FOR SEEDS:**
- Generate EXACTLY 4 seeds (1-2 opportunity + 2-3 quality)
- Each action must be SHORT (5-10 words) - not paragraphs!
- Actions must be UNIVERSAL (not "at work", "at school", "with colleagues")
- Seeds can be planted ANYWHERE with ANYONE
- Include "seedType": "opportunity" or "seedType": "quality" for each seed
- theyFeel and youReceive must be SHORT (3-6 words each)

**CONSCIOUS INTENTION PRINCIPLE:**
Include in mirrorExplanation that seeds work best when done WITH AWARENESS - not just being nice habitually, but consciously planting seeds for change.

**EXAMPLES BY SITUATION:**

BULLYING${isSkeptical ? ' (SKEPTICAL USER)' : ''}:
{
  "reciprocalLaw": "Want respect? → Create safety and respect for others.",
  "mirrorExplanation": "${isSkeptical 
    ? "When you might've made someone feel small or excluded—even without meaning to—that person could've felt that pain. The key now is to consciously plant different seeds: when you protect and respect others with intention, that respect finds its way back to you."
    : "When you made someone feel small or excluded, they felt that pain. Now consciously plant different seeds: protect and respect others with intention, knowing you're creating that energy for yourself."}",
  "seeds": [
    {"emoji": "🛡️", "seedType": "opportunity", "action": "Stand up for someone being picked on", "theyFeel": "protected and defended", "youReceive": "defenders appearing for you"},
    {"emoji": "🚪", "seedType": "opportunity", "action": "Include someone in a group or activity", "theyFeel": "welcomed and wanted", "youReceive": "invitations coming your way"},
    {"emoji": "👁️", "seedType": "quality", "action": "Acknowledge someone who seems invisible", "theyFeel": "seen and noticed", "youReceive": "being truly seen"},
    {"emoji": "💪", "seedType": "quality", "action": "Encourage someone who's struggling", "theyFeel": "believed in", "youReceive": "people believing in you"}
  ]
}

MONEY PROBLEMS:
{
  "reciprocalLaw": "Want money? → Create financial flow for others.",
  "mirrorExplanation": "${isSkeptical
    ? "When you might've held back financially—even unconsciously—that created scarcity energy. Now consciously plant abundance: help others with money and opportunities, knowing you're creating financial flow in your own life."
    : "When you withheld or didn't help financially, you planted scarcity. Now consciously create abundance for others - give, help, open doors - knowing each act plants seeds of money flowing to you."}",
  "seeds": [
    {"emoji": "🚪", "seedType": "opportunity", "action": "Help someone find work or a client", "theyFeel": "doors opening", "youReceive": "financial opportunities appearing"},
    {"emoji": "🤝", "seedType": "opportunity", "action": "Connect someone with a helpful contact", "theyFeel": "supported and hopeful", "youReceive": "helpful connections finding you"},
    {"emoji": "💰", "seedType": "quality", "action": "Give money generously, even small amounts", "theyFeel": "financially supported", "youReceive": "unexpected money flowing"},
    {"emoji": "🎉", "seedType": "quality", "action": "Celebrate someone's financial win genuinely", "theyFeel": "celebrated", "youReceive": "abundance energy"}
  ]
}

LONELINESS/EXCLUSION:
{
  "reciprocalLaw": "Want connection? → Create connection for others.",
  "mirrorExplanation": "${isSkeptical
    ? "When you might've left someone out or didn't respond—that person felt forgotten. Now consciously create connection: reach out, include, introduce people, knowing you're planting seeds for your own social world to bloom."
    : "When you excluded or ignored someone, they felt that loneliness. Now consciously plant connection: reach out, include, introduce - knowing each act creates the connections you're seeking."}",
  "seeds": [
    {"emoji": "🌐", "seedType": "opportunity", "action": "Introduce two people who should know each other", "theyFeel": "connected to new possibilities", "youReceive": "people introducing you"},
    {"emoji": "📱", "seedType": "opportunity", "action": "Reach out to someone who might be lonely", "theyFeel": "remembered and wanted", "youReceive": "people reaching out to you"},
    {"emoji": "👁️", "seedType": "quality", "action": "Give someone your full, present attention", "theyFeel": "truly seen and heard", "youReceive": "people really seeing you"},
    {"emoji": "🤝", "seedType": "quality", "action": "Make someone feel genuinely welcome", "theyFeel": "like they belong", "youReceive": "belonging everywhere"}
  ]
}

Now analyze this conversation and generate the personalized response:`;

  const messagesForGeneration: Message[] = [
    { role: 'system', content: prompt }
  ];
  
  // Add conversation history
  conversationHistory.forEach(msg => {
    messagesForGeneration.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    });
  });

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messagesForGeneration,
        temperature: 0.7,
        max_tokens: 800,
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    
    const content = data.choices[0].message.content;
    
    // Extract JSON from the response (it might be wrapped in markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate and sanitize the response
    return {
      reciprocalLaw: sanitizeResponse(parsed.reciprocalLaw || 'Want change? → Create that change for others.'),
      mirrorExplanation: sanitizeResponse(parsed.mirrorExplanation || 'The feeling you gave to others is the feeling that came back to you.'),
      seeds: (parsed.seeds || []).slice(0, 4).map((seed: any, index: number) => ({
        emoji: seed.emoji || ['🌱', '💝', '🤝', '✨'][index],
        action: sanitizeResponse(seed.action || 'Do something kind for someone'),
        theyFeel: sanitizeResponse(seed.theyFeel || 'cared for'),
        youReceive: sanitizeResponse(seed.youReceive || 'care in return'),
        seedType: seed.seedType || (index < 2 ? 'opportunity' : 'quality'),
      })),
    };
  } catch (error) {
    console.error('DeepSeek Mirror/Seeds Generation Error:', error);
    // Return a generic fallback with both seed types
    return {
      reciprocalLaw: 'Want support? → Create support for others.',
      mirrorExplanation: 'When you consciously support others and open doors for them - knowing you\'re planting seeds - that support and those doors open for you too.',
      seeds: [
        { emoji: '🚪', action: 'Help someone find an opportunity', theyFeel: 'doors opening', youReceive: 'opportunities appearing', seedType: 'opportunity' as const },
        { emoji: '📱', action: 'Reach out to someone who might need it', theyFeel: 'remembered and valued', youReceive: 'people reaching out to you', seedType: 'opportunity' as const },
        { emoji: '👁️', action: 'Give someone your full, present attention', theyFeel: 'truly seen and heard', youReceive: 'being truly seen', seedType: 'quality' as const },
        { emoji: '💝', action: 'Show genuine care for someone struggling', theyFeel: 'supported and cared for', youReceive: 'caring support', seedType: 'quality' as const },
      ],
    };
  }
};

// Generate a clean, short problem title from the user's message (2-4 words)
export const generateProblemTitle = async (
  userMessage: string
): Promise<string> => {
  const prompt = `Generate a SHORT problem title (2-4 words max) for someone's issue.

INPUT: "${userMessage}"

RULES:
- Output ONLY the title, nothing else
- 2-4 words maximum
- Make it descriptive but brief
- Use title case (capitalize each word)
- NO quotes, NO punctuation at the end
- Focus on the CORE issue

EXAMPLES:
- "I'm getting bullied at school" → "School Bullying"
- "I'm scared to go to school because boys laugh at me" → "Bullying at School"
- "I can't pay my rent this month and I'm stressed" → "Financial Stress"
- "I feel so lonely, no one texts me back" → "Feeling Lonely"
- "My relationship is falling apart" → "Relationship Struggles"
- "I'm not getting promoted at work" → "Career Stagnation"
- "I can't sleep because of anxiety" → "Sleep Anxiety"
- "My parents always fight" → "Family Conflict"

OUTPUT THE TITLE ONLY:`;

  const messagesForGeneration: Message[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: userMessage }
  ];

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messagesForGeneration,
        temperature: 0.3, // Low temperature for consistent titles
        max_tokens: 20, // Very short response
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    
    // Clean up the response - remove quotes, trim, etc.
    let title = data.choices[0].message.content.trim();
    title = title.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
    title = title.replace(/[.!?]$/, ''); // Remove trailing punctuation
    
    // Ensure it's not too long (fallback to first 4 words if needed)
    const words = title.split(' ');
    if (words.length > 5) {
      title = words.slice(0, 4).join(' ');
    }
    
    return title || 'My Challenge';
  } catch (error) {
    console.error('DeepSeek Title Generation Error:', error);
    // Fallback: create a simple title from the first few words
    const words = userMessage.split(' ').slice(0, 4);
    const fallbackTitle = words.join(' ');
    return fallbackTitle.length > 30 ? fallbackTitle.substring(0, 30) + '...' : fallbackTitle;
  }
};

// Interface for experience option
export interface ExperienceOption {
  emoji: string;
  text: string;
}

// Generate experience options for the user to select based on their problem and emotion
export const generateExperienceOptions = async (
  conversationHistory: ChatMessage[]
): Promise<ExperienceOption[]> => {
  const prompt = `TASK: Generate PRIMARY EXPERIENCE options as a JSON array.

⚠️ CRITICAL INSTRUCTIONS:
- Return ONLY a raw JSON array
- Do NOT include any text before or after the JSON
- Do NOT ask questions
- Do NOT have a conversation
- Do NOT explain anything
- JUST output the JSON array, nothing else

OUTPUT FORMAT (ONLY THIS, NOTHING ELSE):
[{"emoji": "😔", "text": "..."}, {"emoji": "😰", "text": "..."}, ...]

WHAT TO GENERATE:
- 5-6 PRIMARY experiences (what's HAPPENING to them)
- NOT feelings, NOT symptoms, NOT coping mechanisms
- Use first-person phrasing
- 5-8 words max per option

EXAMPLES BY SITUATION:

BULLYING:
[{"emoji": "😔", "text": "People laugh at me"}, {"emoji": "🗣️", "text": "I get called names or mocked"}, {"emoji": "🚫", "text": "I'm excluded from groups"}, {"emoji": "👥", "text": "I sit alone at lunch"}, {"emoji": "😰", "text": "People make fun of me publicly"}, {"emoji": "💔", "text": "No one stands up for me"}]

MONEY PROBLEMS:
[{"emoji": "💸", "text": "I can't pay my bills"}, {"emoji": "🏠", "text": "I might lose my home"}, {"emoji": "🛒", "text": "I can't afford basic needs"}, {"emoji": "💳", "text": "My debt keeps growing"}, {"emoji": "📉", "text": "My income isn't enough"}, {"emoji": "🚫", "text": "I can't save any money"}]

LONELINESS:
[{"emoji": "📱", "text": "No one texts or calls me"}, {"emoji": "🚪", "text": "I'm never invited anywhere"}, {"emoji": "👥", "text": "I have no close friends"}, {"emoji": "🍽️", "text": "I eat meals alone"}, {"emoji": "🏠", "text": "I spend weekends by myself"}, {"emoji": "💬", "text": "No one checks in on me"}]

WAR/DISPLACEMENT:
[{"emoji": "🏠", "text": "I had to leave my home"}, {"emoji": "👨‍👩‍👧", "text": "I'm separated from loved ones"}, {"emoji": "🌍", "text": "I can't return to my homeland"}, {"emoji": "💔", "text": "I've lost people I care about"}, {"emoji": "😰", "text": "I don't feel safe"}, {"emoji": "🚪", "text": "I'm living as a refugee"}]

DISABILITY/ILLNESS (CHILD OR SELF):
[{"emoji": "🏥", "text": "Medical care is constant"}, {"emoji": "💔", "text": "Others don't understand my struggle"}, {"emoji": "😰", "text": "The future feels uncertain"}, {"emoji": "🏠", "text": "Daily life is much harder"}, {"emoji": "👥", "text": "I feel isolated from others"}, {"emoji": "💸", "text": "The costs are overwhelming"}]

POVERTY/HARDSHIP:
[{"emoji": "🏠", "text": "I was born into poverty"}, {"emoji": "💸", "text": "Basic needs are a struggle"}, {"emoji": "📚", "text": "I lacked opportunities growing up"}, {"emoji": "👥", "text": "Others had more than me"}, {"emoji": "😔", "text": "I had to work very young"}, {"emoji": "🚪", "text": "Moving up feels impossible"}]

Read the conversation below and output ONLY the JSON array:`;

  const messagesForGeneration: Message[] = [
    { role: 'system', content: prompt }
  ];
  
  // Add conversation history
  conversationHistory.forEach(msg => {
    messagesForGeneration.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    });
  });

  // CRITICAL: Add final user message to force JSON output
  // This tells DeepSeek to respond with JSON, not continue the conversation
  messagesForGeneration.push({
    role: 'user',
    content: 'Based on this conversation, output ONLY a JSON array of 5-6 primary experiences. Format: [{"emoji": "😔", "text": "..."}, ...]. ONLY the JSON array, nothing else.'
  });

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messagesForGeneration,
        temperature: 0.3, // Very low for consistent JSON output
        max_tokens: 350, // Slightly more for complex topics
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    
    const content = data.choices[0].message.content.trim();
    
    // Try multiple methods to extract JSON array
    let parsed = null;
    
    // Method 1: Try parsing the whole content directly (most common for well-behaved responses)
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Continue to next method
    }
    
    // Method 2: Extract from markdown code block
    if (!parsed) {
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1].trim());
        } catch (e) {
          // Continue to next method
        }
      }
    }
    
    // Method 3: Find raw JSON array in the response (handles "Here are the options: [...]")
    if (!parsed) {
      const firstBracket = content.indexOf('[');
      const lastBracket = content.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        try {
          const jsonCandidate = content.substring(firstBracket, lastBracket + 1);
          parsed = JSON.parse(jsonCandidate);
        } catch (e) {
          // Continue to fallback
        }
      }
    }
    
    // Method 4: Try to find and fix common JSON issues (trailing commas, etc.)
    if (!parsed) {
      try {
        // Remove any text before the first [ and after the last ]
        let jsonStr = content;
        const start = jsonStr.indexOf('[');
        const end = jsonStr.lastIndexOf(']');
        if (start !== -1 && end > start) {
          jsonStr = jsonStr.substring(start, end + 1);
          // Remove trailing commas before ]
          jsonStr = jsonStr.replace(/,\s*]/g, ']');
          parsed = JSON.parse(jsonStr);
        }
      } catch (e) {
        // Fall through to fallback
      }
    }
    
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      // Validate and return options
      return parsed.slice(0, 6).map((opt: any, index: number) => ({
        emoji: opt.emoji || ['😔', '😰', '💔', '😶', '🚪', '👻'][index],
        text: sanitizeResponse(opt.text || 'I struggle with this'),
      }));
    }
    
    // Log what we received to debug parsing issues
    console.log('=== Experience Options Parsing Failed ===');
    console.log('Raw content from DeepSeek:');
    console.log(content);
    console.log('Content length:', content?.length);
    console.log('==========================================');
    
    throw new Error('Could not parse experience options');
  } catch (error) {
    console.error('DeepSeek Experience Options Error:', error);
    // Return universal fallback options that work for any situation including heavy topics
    return [
      { emoji: '💔', text: 'This causes me deep pain' },
      { emoji: '😰', text: 'I feel unsafe or threatened' },
      { emoji: '🏠', text: 'My daily life is disrupted' },
      { emoji: '👨‍👩‍👧', text: 'It affects my loved ones too' },
      { emoji: '😔', text: 'I feel powerless to change it' },
    ];
  }
};

// ============================================
// GOAL MODE FUNCTIONS
// ============================================

// Goal Mode System Prompt - for excitement and forward-focused conversation
const GOAL_MODE_SYSTEM_PROMPT = `You are the SeedMind Guide helping someone achieve a GOAL or aspiration.

## YOUR ROLE
You're an excited, supportive mentor helping someone manifest their dreams through seed-planting.

## TONE
- Excited and encouraging (not just supportive)
- Forward-focused (not looking at past problems)
- Practical and action-oriented
- Like a coach pumping someone up before a big moment

## RULES
- NO markdown formatting (no #, ##, ###, **, *)
- Use emojis sparingly for warmth
- Keep responses conversational, not lecture-y
- Focus on what they WANT, not what they fear
- Get excited about their goal!`;

// Get Goal Mode excitement response for Phase 1
export const getGoalModeExcitementResponse = async (
  conversationHistory: ChatMessage[],
  userGoal: string
): Promise<string> => {
  const prompt = `The user just shared their GOAL: "${userGoal}"

Your job: Get GENUINELY EXCITED with them! Match their energy and amplify it. This is a big moment for them.

REQUIREMENTS:
- Be enthusiastic and warm (like a supportive friend who's excited FOR them)
- Acknowledge how exciting/meaningful this goal is
- Show you understand WHY this matters
- Paint a brief picture of what success could feel like
- Ask 1-2 questions to understand their goal better (timeline, what success looks like, why it matters)
- Write 4-6 sentences (not too short!)
- NO markdown formatting (no #, **, etc.)
- Use 1-2 emojis naturally

GOOD EXAMPLE:
"Oh wow, a scholarship competition - that's incredible! 🎯 The fact that you're going for this tells me you're someone who goes after what you want. Top 10 out of everyone competing... imagine the moment they call your name. That feeling of 'I did it.' Tell me more - when exactly is the competition, and what would landing this scholarship mean for your future? I want to help you plant the right seeds for this."

BAD EXAMPLE (too short):
"That's exciting! Tell me more about it."

Now respond to their goal with genuine excitement:`;

  const messages: Message[] = [
    { role: 'system', content: GOAL_MODE_SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];

  // Add conversation history
  conversationHistory.forEach(msg => {
    messages.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    });
  });

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.85,
        max_tokens: 500,
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    return sanitizeResponse(data.choices[0].message.content);
  } catch (error) {
    console.error('Goal Mode Excitement Error:', error);
    return "Oh wow, this is exciting! 🎯 I can already tell this goal means a lot to you - and that matters. Tell me more about it. When is it happening, and what would achieving it mean for you? I want to help you plant the right seeds.";
  }
};

// Generate warm validation response for Goal Mode (after user shares details about their goal)
export const getGoalModeValidationResponse = async (
  conversationHistory: ChatMessage[],
  userDetails: string
): Promise<string> => {
  const prompt = `The user just shared their VISION of what they want. This is vulnerable and meaningful.

WHAT THEY SHARED: "${userDetails}"

READ THE FULL CONVERSATION for context about their goal.

Your job: Honor what they shared with warmth, then transition to showing them how to plant seeds.

REQUIREMENTS:
1. REFLECT BACK the beautiful/meaningful parts of what they shared (use their words/imagery)
2. VALIDATE that this is a worthy vision/desire
3. Create a moment of CONNECTION before moving on
4. End with a warm, brief transition: "Here's the beautiful thing about seeds..." or similar
5. Write 4-6 sentences
6. NO markdown formatting
7. Use 1-2 emojis naturally (💜 ✨ 🌱)

GOOD EXAMPLE (for "I want someone whose gaze draws me in, who's caring and trustworthy, who I can laugh with"):
"That's such a beautiful picture of love - someone whose gaze and smile light you up, who's caring and kind and trustworthy... and who you can laugh at life with. 💜 That's not just a goal - that's a deep longing for real, genuine connection. And you absolutely deserve all of it. Here's the beautiful thing: the way to find that person is to become that energy for others. Let me show you exactly how to plant those seeds..."

BAD EXAMPLE (too cold/transactional):
"Perfect! I understand your goal now. Let me show you how to plant seeds."

Now respond with warmth to what they shared:`;

  const messages: Message[] = [
    { role: 'system', content: GOAL_MODE_SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];

  // Add conversation history
  conversationHistory.forEach(msg => {
    messages.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    });
  });

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.85,
        max_tokens: 400,
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    return sanitizeResponse(data.choices[0].message.content);
  } catch (error) {
    console.error('Goal Mode Validation Error:', error);
    return "What you just shared is beautiful - that's a real vision of what you want in your heart. 💜 And you deserve to have it. Here's the powerful thing: to receive this, you plant seeds of giving it to others. Let me show you how...";
  }
};

// Generate Goal Mode seeds with the principle woven in
// IMPORTANT: Seeds must include BOTH types:
// 1. OPPORTUNITY seeds - create the circumstance for the goal to appear (meeting people, opening doors)
// 2. QUALITY seeds - shape the quality of what you attract (how they treat you, what they're like)
export const getGoalModeSeeds = async (
  conversationHistory: ChatMessage[]
): Promise<PersonalizedMirrorAndSeeds> => {
  const prompt = `Based on the user's GOAL from this conversation, generate personalized seed suggestions.

READ THE CONVERSATION to understand:
1. What specific goal they want to achieve
2. What qualities/outcomes they want
3. Timeline if mentioned

## CRITICAL: TWO TYPES OF SEEDS (YOU MUST INCLUDE BOTH!)

**TYPE 1: OPPORTUNITY SEEDS** (MUST have 1-2)
- These CREATE THE CIRCUMSTANCE for the goal to manifest
- They bring the opportunity, person, or situation INTO their life
- Without these, the user can embody qualities forever but never meet the opportunity
- ⭐ MARK THESE with "seedType": "opportunity" in the JSON

Examples of OPPORTUNITY seeds:
- Love: "Help a single friend with their dating profile" → Creates romantic opportunities
- Love: "Introduce two people who might connect" → Opens doors for love
- Money: "Help someone find a job or client" → Creates money opportunities  
- Success: "Recommend someone for an opportunity" → Opportunities open for you
- Health: "Connect someone with a helpful doctor/resource" → Health resources appear

**TYPE 2: QUALITY SEEDS** (MUST have 2-3)
- These shape the QUALITY of what they attract
- They determine what the person/situation is LIKE
- ⭐ MARK THESE with "seedType": "quality" in the JSON

Examples of QUALITY seeds:
- Love: "Be fiercely loyal in your commitments" → Attracts a loyal partner
- Love: "Listen with full presence" → Attracts someone who truly listens
- Money: "Give generously without strings" → Attracts generous abundance
- Success: "Celebrate others' wins genuinely" → Attracts genuine celebration

## CONSCIOUS INTENTION PRINCIPLE
Seeds work because they are done WITH AWARENESS. Include this in mirrorExplanation:
"When you CONSCIOUSLY [action] for others, knowing you're planting seeds for [goal], that energy returns to you."

## OUTPUT FORMAT (strict JSON):
{
  "reciprocalLaw": "Want X? → Create X for others." (matched to their specific goal),
  "mirrorExplanation": "2-3 sentences explaining: (1) the direct cause-effect, (2) that conscious intention matters",
  "seeds": [
    {
      "emoji": "🚪",
      "action": "Short, specific action (5-10 words max)",
      "theyFeel": "Short feeling (3-6 words)",
      "youReceive": "What mirrors back (3-6 words)",
      "seedType": "opportunity"
    },
    {
      "emoji": "💜",
      "action": "Short, specific action (5-10 words max)",
      "theyFeel": "Short feeling (3-6 words)", 
      "youReceive": "What mirrors back (3-6 words)",
      "seedType": "quality"
    }
  ]
}

## EXAMPLES BY GOAL TYPE:

**FINDING SOULMATE/ROMANTIC PARTNER:**
⚠️ THIS IS CRITICAL - Seeds for romantic love must be SPECIFICALLY about romantic love, NOT generic kindness!

The user wants ROMANTIC love. Generic "be nice" seeds (listen to people, make someone laugh, be present) are NOT helpful because:
1. They already do these things
2. These could be seeds for ANY goal, not specifically romance
3. They don't feel connected to finding a partner

GOOD SEEDS FOR ROMANTIC LOVE:

**OPPORTUNITY seeds** = Actions that DIRECTLY support others' romantic lives or celebrate romantic love:
- "Send heartfelt congratulations to someone who got engaged" (celebrates romantic love)
- "Genuinely wish for someone you know to find their person" (creates romantic energy)
- "Support a friend through dating disappointment without judgment" (enters romantic journey)
- "Express genuine happiness when someone shares relationship news" (honors romantic love)
- "Help someone feel confident before a date" (supports their romantic search)

**QUALITY seeds** = Embody SPECIFIC relationship qualities (not generic "be nice"):
- "Keep a romantic secret sacred (crush, heartbreak, hope)" (trustworthy in matters of the heart)
- "Say 'I love you' or 'I appreciate you' first, without waiting" (vulnerability in love)
- "Forgive someone fully who hurt you in a relationship" (clears romantic energy)
- "Stay devoted to a commitment even when it's inconvenient" (embodies partnership loyalty)
- "Share something vulnerable about your own heart with someone" (attracts vulnerability)

{
  "reciprocalLaw": "Want deep love? → Actively support and celebrate love around you.",
  "mirrorExplanation": "When you consciously celebrate others' romantic love, support their romantic journeys, and embody the partner qualities you seek - with full awareness that you're planting seeds - that love energy flows toward you.",
  "seeds": [
    {"emoji": "💌", "seedType": "opportunity", "action": "Send genuine congratulations to someone newly engaged", "theyFeel": "their love is celebrated", "youReceive": "romantic love flowing to you"},
    {"emoji": "💔", "seedType": "opportunity", "action": "Support a friend through dating disappointment", "theyFeel": "not alone in their search", "youReceive": "support when you need it"},
    {"emoji": "🤫", "seedType": "quality", "action": "Keep someone's romantic secret completely sacred", "theyFeel": "safe with their heart", "youReceive": "a partner you can trust"},
    {"emoji": "💜", "seedType": "quality", "action": "Say 'I love you' first to someone in your life", "theyFeel": "loved without having to ask", "youReceive": "someone who loves you first"}
  ]
}

DO NOT generate generic seeds like:
❌ "Listen deeply to a friend" - too generic, not romantic-specific
❌ "Make someone laugh" - too generic, not romantic-specific  
❌ "Be present with someone" - too generic, not romantic-specific
❌ "Give undivided attention" - too generic, not romantic-specific
❌ "Help set up two friends" - assumes they have single friends to set up

DO generate seeds that are:
✅ SPECIFICALLY about romantic love/relationships
✅ Doable by ANYONE (don't require having single friends)
✅ About LOVE matters specifically (engagements, dating, relationship secrets, romantic vulnerability)

**COMPETITION/WINNING:**
{
  "reciprocalLaw": "Want to win? → Help others win their battles.",
  "mirrorExplanation": "When you consciously support others' victories - knowing you're planting seeds for your own win - that winning energy multiplies back to you. It's not just being supportive; it's strategically creating victory in your world.",
  "seeds": [
    {"emoji": "🚪", "seedType": "opportunity", "action": "Help someone get into a competition they want", "theyFeel": "given their chance", "youReceive": "your chance appearing"},
    {"emoji": "🏆", "seedType": "opportunity", "action": "Connect someone with a mentor or resource", "theyFeel": "doors opening", "youReceive": "doors opening for you"},
    {"emoji": "💪", "seedType": "quality", "action": "Help someone prepare with genuine care", "theyFeel": "confident and ready", "youReceive": "confidence when you need it"},
    {"emoji": "📣", "seedType": "quality", "action": "Publicly cheer on a competitor with real enthusiasm", "theyFeel": "believed in", "youReceive": "people rooting for you"}
  ]
}

**MONEY/FINANCIAL:**
{
  "reciprocalLaw": "Want abundance? → Create abundance for others.",
  "mirrorExplanation": "When you consciously open financial doors for others and give generously - knowing you're planting seeds of abundance - that flow reverses toward you. Do it with intention, not just habit.",
  "seeds": [
    {"emoji": "🚪", "seedType": "opportunity", "action": "Help someone find a job, client, or opportunity", "theyFeel": "doors opening", "youReceive": "opportunities appearing for you"},
    {"emoji": "🤝", "seedType": "opportunity", "action": "Connect someone with a person who could help them", "theyFeel": "supported and hopeful", "youReceive": "helpful connections appearing"},
    {"emoji": "💰", "seedType": "quality", "action": "Give money generously without strings attached", "theyFeel": "financially supported", "youReceive": "unexpected money flowing"},
    {"emoji": "🎉", "seedType": "quality", "action": "Celebrate someone's financial win with real joy", "theyFeel": "celebrated and supported", "youReceive": "abundance energy"}
  ]
}

Generate 4 seeds that match their SPECIFIC goal. 
⚠️ CRITICAL: Include AT LEAST 1-2 OPPORTUNITY seeds and 2-3 QUALITY seeds. Mark each with seedType.
Make them actionable THIS WEEK.

⚠️ FOR ROMANTIC/SOULMATE GOALS: Seeds MUST be specifically about romantic love matters (dating, engagements, relationship secrets, romantic vulnerability). Do NOT give generic "be kind" seeds that could apply to any goal.`;

  const messages: Message[] = [
    { role: 'system', content: prompt }
  ];

  // Add conversation history
  conversationHistory.forEach(msg => {
    messages.push({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.text
    });
  });

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.7,
        max_tokens: 800,
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    
    const content = data.choices[0].message.content;
    
    // Extract JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    
    return {
      reciprocalLaw: sanitizeResponse(parsed.reciprocalLaw || 'Want success? → Create success for others.'),
      mirrorExplanation: sanitizeResponse(parsed.mirrorExplanation || 'When you help others achieve their goals, you plant seeds of achievement that grow back to you.'),
      seeds: (parsed.seeds || []).slice(0, 4).map((seed: any, index: number) => ({
        emoji: seed.emoji || ['🏆', '⭐', '💪', '🎯'][index],
        action: sanitizeResponse(seed.action || 'Help someone succeed'),
        theyFeel: sanitizeResponse(seed.theyFeel || 'supported'),
        youReceive: sanitizeResponse(seed.youReceive || 'support returning'),
        seedType: seed.seedType || (index < 2 ? 'opportunity' : 'quality'),
      })),
    };
  } catch (error) {
    console.error('Goal Mode Seeds Generation Error:', error);
    // Return generic goal-focused fallback with both types
    return {
      reciprocalLaw: 'Want to receive? → Consciously give that to others.',
      mirrorExplanation: 'When you consciously create for others what you want to receive - with full awareness you\'re planting seeds - that energy multiplies back to you.',
      seeds: [
        { emoji: '🚪', action: 'Help someone get an opportunity they want', theyFeel: 'doors opening', youReceive: 'opportunities appearing', seedType: 'opportunity' as const },
        { emoji: '🎉', action: 'Genuinely celebrate someone\'s milestone', theyFeel: 'their joy is honored', youReceive: 'celebrations in your future', seedType: 'opportunity' as const },
        { emoji: '🤫', action: 'Keep someone\'s important secret completely sacred', theyFeel: 'safe and trusted', youReceive: 'trustworthy people', seedType: 'quality' as const },
        { emoji: '💜', action: 'Be the first to express care or appreciation', theyFeel: 'loved without asking', youReceive: 'love coming to you', seedType: 'quality' as const },
      ],
    };
  }
};

// Generate a clean, short goal title from the user's message (2-4 words)
export const generateGoalTitle = async (
  userMessage: string
): Promise<string> => {
  const prompt = `Generate a SHORT goal title (2-4 words max) for someone's aspiration.

INPUT: "${userMessage}"

RULES:
- Output ONLY the title, nothing else
- 2-4 words maximum
- Make it sound like a GOAL (positive, forward-looking)
- Use title case (capitalize each word)
- NO quotes, NO punctuation at the end
- Focus on the DESIRED OUTCOME

EXAMPLES:
- "I want to win the competition this Friday" → "Winning Friday's Competition"
- "I'm trying to get promoted at work" → "Getting Promoted"
- "I want to find my soulmate" → "Finding Love"
- "I want to make more money" → "Financial Abundance"
- "I want to ace my exams" → "Acing My Exams"
- "I want to start my own business" → "Launching My Business"

OUTPUT THE TITLE ONLY:`;

  const messages: Message[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: userMessage }
  ];

  try {
    const bearer = await getAuthBearerForDeepSeek();
    const response = await fetch(getDeepSeekApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.3,
        max_tokens: 20,
        top_p: 0.9,
      }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    if (!data.choices?.[0]?.message) throw new Error('Invalid response');
    
    let title = data.choices[0].message.content.trim();
    title = title.replace(/^["']|["']$/g, '');
    title = title.replace(/[.!?]$/, '');
    
    const words = title.split(' ');
    if (words.length > 5) {
      title = words.slice(0, 4).join(' ');
    }
    
    return title || 'My Goal';
  } catch (error) {
    console.error('Goal Title Generation Error:', error);
    const words = userMessage.split(' ').slice(0, 4);
    return words.join(' ').substring(0, 30) || 'My Goal';
  }
};

export default { 
  sendMessageToDeepSeek, 
  sendPostCompletionMessage,
  sendDirectChatMessage,
  convertToApiMessages, 
  getFeelingValidationFromDeepSeek, 
  getPersonalizedExplorationMessage, 
  getPersonalizedMirrorAndSeeds, 
  generateProblemTitle, 
  generateExperienceOptions,
  getGoalModeExcitementResponse,
  getGoalModeValidationResponse,
  getGoalModeSeeds,
  generateGoalTitle,
};
