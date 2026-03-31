export type NextStepOfferLanguage = 'en' | 'ru';

export type NextStepOfferIntent =
  | 'default'
  | 'progress_update'
  | 'seed_list_request'
  | 'motivation_request'
  | 'direct_question';

export type NextStepOfferContext = {
  language: NextStepOfferLanguage;
  category?: string;
  conversationMode?: 'problem' | 'goal';
  phase?: number | 'completed';
  isCompleted?: boolean;
  isHeavyTopic?: boolean;
  intent?: NextStepOfferIntent;
  inJourneyContext?: boolean;
};

type Offer = {
  key: string;
  lines: string[];
};

const alreadyHasOffer = (text: string) =>
  /\bif you want\b|\bif you'd like\b|если хочешь|если хотите|хочешь, я могу|хочешь — могу/i.test(
    text
  );

const looksLikeQuestioningResponse = (text: string) => {
  const trimmed = (text || '').trim();
  if (!trimmed) return true;
  // Ends with a question mark or has a question as the final sentence.
  if (/[?？]\s*$/.test(trimmed)) return true;
  // Explicit "please answer a question" phrasing (even if the message doesn't end with "?")
  // should NOT include a next-step offer. Offers start only after the "seeds/CTA" style messages.
  if (
    /(прежде чем|перед тем как)[\s\S]{0,160}(ответь|ответьте)/i.test(trimmed) ||
    /(ответь|ответьте)[\s\S]{0,80}(на\s+один\s+вопрос|на\s+вопрос|вопрос:)/i.test(trimmed) ||
    /(уточни|уточните)[\s\S]{0,80}/i.test(trimmed)
  ) {
    return true;
  }
  if (
    /(before i|before we)[\s\S]{0,160}(answer|tell me)/i.test(trimmed) ||
    /(answer (?:me|this)|one (?:quick|small) question|before i (?:suggest|share|give))[\s\S]{0,160}\bquestion\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  // Common invitation-to-share patterns where we shouldn't add another "if you want" tail.
  if (
    /\btell me\b|\bcan you tell me\b|\bwhat's been\b|\bwhat feels\b|\bhow do you feel\b|\bwhat have you noticed\b/i.test(
      trimmed
    )
  )
    return true;
  if (
    /расскаж(и|ите)|что (?:ты|вы) чувств(уешь|уете)|как (?:ты|вы) себя чувств(уешь|уете)|что (?:ты|вы) заметил(а|и)?|что происходит/i.test(
      trimmed
    )
  )
    return true;
  return false;
};

export type NextStepOfferState = {
  rotation: Map<string, number>;
};

export const createNextStepOfferState = (): NextStepOfferState => ({
  rotation: new Map<string, number>(),
});

const getBucket = (ctx: NextStepOfferContext): string => {
  const category = (ctx.category || 'general').toString();
  const mode = ctx.conversationMode || 'problem';
  if (category === 'safety') return 'none';
  if (ctx.isCompleted || ctx.phase === 'completed') return 'completed';
  if (ctx.intent === 'progress_update') return 'progress';
  if (ctx.intent === 'seed_list_request') return 'after_seed_list';
  if (ctx.intent === 'motivation_request') return ctx.inJourneyContext ? 'motivation_in_journey' : 'motivation_generic';
  if (category === 'health' && mode === 'goal') return 'health_goal';
  return 'default';
};

const OFFERS: Record<NextStepOfferLanguage, Record<string, Offer[]>> = {
  en: {
    progress: [
      {
        key: 'p_5_seeds_week',
        lines: ['If you want, I can suggest 5 seeds for this week—tiny and realistic, based on what you just did.'],
      },
      {
        key: 'p_plan_3',
        lines: ['If you want, I can turn your momentum into a simple 3‑day plan (very light, very doable).'],
      },
      {
        key: 'p_big_list',
        lines: ['If you want, I can make a list of 20–30 seeds for your goal—then we’ll pick the best 1–2.'],
      },
      {
        key: 'p_checkin',
        lines: ['If you want, we can set a 2‑minute check‑in for tomorrow so you keep the streak going.'],
      },
    ],
    motivation_generic: [
      {
        key: 'mg_plan_10',
        lines: ["If you want, I can turn this into a 10‑minute starter plan for today—step by step."],
      },
      {
        key: 'mg_script_20s',
        lines: ["If you want, I can write a 20‑second 'get up and go' script to read to yourself before you move."],
      },
      {
        key: 'mg_minimum',
        lines: ['If you want, I can help you choose a “minimum version” so a small win still counts today.'],
      },
      {
        key: 'mg_before_during_after',
        lines: ["If you want, I can make a tiny before/during/after plan so you feel steady the whole way."],
      },
    ],
    motivation_in_journey: [
      {
        key: 'mj_easiest_version',
        lines: ["If you want, I can help you choose the easiest version of this seed to plant today—so it’s brave, but doable."],
      },
      {
        key: 'mj_words',
        lines: ['If you want, I can help you craft the exact words to say (one simple sentence).'],
      },
      {
        key: 'mj_courage_plan',
        lines: ["If you want, I can give you a 2‑minute courage plan for right before you do it (breathe + cue + go)."],
      },
      {
        key: 'mj_if_freeze',
        lines: ["If you want, I can make a 'freeze plan'—what to do if you panic or they don’t respond well."],
      },
    ],
    after_seed_list: [
      {
        key: 'asl_pick_2',
        lines: ["If you want, tell me which 3 seeds feel most realistic—and I’ll help you pick the best 1–2 for this week."],
      },
      {
        key: 'asl_plan_7',
        lines: ['If you want, I can turn your top 2 seeds into a simple 7‑day plan.'],
      },
      {
        key: 'asl_checkin',
        lines: ['If you want, I can give you one daily check‑in question to keep it consistent.'],
      },
    ],
    health_goal: [
      {
        key: 'hg_motivation',
        lines: [
          'If you want, I can give you a gentle boost of motivation for today—no pressure.',
        ],
      },
      {
        key: 'hg_big_list',
        lines: [
          "If you want, I can make a list of 20–30 seeds for your goal—then we'll pick 1–2 that are actually realistic for this week.",
        ],
      },
      {
        key: 'hg_plan_7',
        lines: ['If you want, I can turn this into a simple 7‑day plan so you actually get started.'],
      },
      {
        key: 'hg_easiest_step',
        lines: ['If you want, I can help you choose the easiest first step for today (under 10 minutes).'],
      },
      {
        key: 'hg_slip_plan',
        lines: ["If you want, I can make a 'slip plan'—what to do if you miss a day, so you don't spiral."],
      },
      {
        key: 'hg_checkin',
        lines: ['If you want, we can set a 2‑minute check‑in for tomorrow (what to notice + what to do next).'],
      },
    ],
    completed: [
      {
        key: 'c_checkin',
        lines: ["If you want, we can do a quick check‑in: what has shifted since you started planting seeds?"],
      },
      {
        key: 'c_big_list',
        lines: [
          "If you want, I can make a list of 20–30 seeds that support your next chapter—then we'll choose the most meaningful ones.",
        ],
      },
      {
        key: 'c_next_seed',
        lines: ['If you want, I can help you choose one next seed to plant this week to keep the momentum.'],
      },
      {
        key: 'c_new_journey',
        lines: ["If you want, we can start a fresh journey—one focused goal or challenge at a time."],
      },
    ],
    default: [
      {
        key: 'd_easiest',
        lines: ['If you want, I can help you pick the simplest next step you can do today.'],
      },
      {
        key: 'd_big_list',
        lines: [
          "If you want, I can make a list of 20–30 seeds for your goal—then we'll pick 1–2 that are actually realistic for this week.",
        ],
      },
      {
        key: 'd_plan',
        lines: ['If you want, I can turn this into a tiny plan for the next 3 days (simple and realistic).'],
      },
      {
        key: 'd_words',
        lines: ['If you want, I can help you find the exact words to say or do the next seed with confidence.'],
      },
      {
        key: 'd_checkin',
        lines: ['If you want, we can set a quick check‑in question for tomorrow to stay on track.'],
      },
    ],
  },
  ru: {
    progress: [
      {
        key: 'p_5_seeds_week',
        lines: ['Если хочешь, я могу предложить 5 семян на эту неделю — маленьких и реалистичных, отталкиваясь от твоего шага.'],
      },
      {
        key: 'p_plan_3',
        lines: ['Если хочешь, я могу превратить это в простой план на 3 дня (очень лёгкий и выполнимый).'],
      },
      {
        key: 'p_big_list',
        lines: ['Если хочешь, я могу составить список из 20–30 семян под твою цель — а потом выберем лучшие 1–2.'],
      },
      {
        key: 'p_checkin',
        lines: ['Если хочешь, давай поставим чек‑ин на завтра на 2 минуты, чтобы закрепить темп.'],
      },
    ],
    motivation_generic: [
      {
        key: 'mg_plan_10',
        lines: ['Если хочешь, я могу превратить это в план на 10 минут на сегодня — шаг за шагом.'],
      },
      {
        key: 'mg_script_20s',
        lines: ['Если хочешь, я могу написать “скрипт на 20 секунд”, который ты прочитаешь себе перед тем как встать и пойти.'],
      },
      {
        key: 'mg_minimum',
        lines: ['Если хочешь, я помогу выбрать “минимальную версию”, чтобы даже маленькая победа засчиталась сегодня.'],
      },
      {
        key: 'mg_before_during_after',
        lines: ['Если хочешь, я могу сделать маленький план “до/во время/после”, чтобы ты чувствовал(а) опору весь путь.'],
      },
    ],
    motivation_in_journey: [
      {
        key: 'mj_easiest_version',
        lines: ['Если хочешь, я помогу выбрать самую лёгкую версию этого семени на сегодня — смело, но выполнимо.'],
      },
      {
        key: 'mj_words',
        lines: ['Если хочешь, я помогу подобрать точные слова (одно простое предложение).'],
      },
      {
        key: 'mj_courage_plan',
        lines: ['Если хочешь, я дам план “2 минуты смелости” прямо перед действием (дыхание + фраза + шаг).'],
      },
      {
        key: 'mj_if_freeze',
        lines: ['Если хочешь, я сделаю “план на ступор”: что делать, если станет страшно или тебе не ответят.'],
      },
    ],
    after_seed_list: [
      {
        key: 'asl_pick_2',
        lines: ['Если хочешь, назови 3 семени, которые кажутся самыми реальными — и я помогу выбрать лучшие 1–2 на эту неделю.'],
      },
      {
        key: 'asl_plan_7',
        lines: ['Если хочешь, я могу превратить твои 2 главных семени в простой план на 7 дней.'],
      },
      {
        key: 'asl_checkin',
        lines: ['Если хочешь, я могу предложить один ежедневный вопрос‑чек‑ин, чтобы держать курс.'],
      },
    ],
    health_goal: [
      {
        key: 'hg_motivation',
        lines: ['Если хочешь, я могу мягко замотивировать тебя на сегодня — без давления.'],
      },
      {
        key: 'hg_big_list',
        lines: [
          'Если хочешь, я могу составить список из 20–30 семян под твою цель — а потом мы выберем 1–2 самых реальных на эту неделю.',
        ],
      },
      {
        key: 'hg_plan_7',
        lines: ['Если хочешь, я могу собрать простой план на 7 дней, чтобы ты реально начал(а).'],
      },
      {
        key: 'hg_easiest_step',
        lines: ['Если хочешь, я помогу выбрать самое простое первое действие на сегодня (до 10 минут).'],
      },
      {
        key: 'hg_slip_plan',
        lines: [
          'Если хочешь, я могу сделать “план на срыв”: что делать, если пропустишь день, чтобы не откатиться.',
        ],
      },
      {
        key: 'hg_checkin',
        lines: ['Если хочешь, давай поставим чек‑ин на завтра на 2 минуты: что заметить и что сделать дальше.'],
      },
    ],
    completed: [
      {
        key: 'c_checkin',
        lines: [
          'Если хочешь, давай сделаем быстрый чек‑ин: что уже сдвинулось с момента, как ты начал(а) сажать семена?',
        ],
      },
      {
        key: 'c_big_list',
        lines: [
          'Если хочешь, я могу составить список из 20–30 семян для твоего следующего шага — а потом мы выберем самые важные.',
        ],
      },
      {
        key: 'c_next_seed',
        lines: ['Если хочешь, я помогу выбрать одно следующее семя на эту неделю, чтобы сохранить темп.'],
      },
      {
        key: 'c_new_journey',
        lines: ['Если хочешь, начнём новое путешествие — по одной цели или теме за раз.'],
      },
    ],
    default: [
      {
        key: 'd_easiest',
        lines: ['Если хочешь, я помогу выбрать самый простой следующий шаг, который ты сделаешь уже сегодня.'],
      },
      {
        key: 'd_big_list',
        lines: [
          'Если хочешь, я могу составить список из 20–30 семян под твою цель — а потом мы выберем 1–2 самых реальных на эту неделю.',
        ],
      },
      {
        key: 'd_plan',
        lines: ['Если хочешь, я могу собрать маленький план на 3 дня — очень простой и реалистичный.'],
      },
      {
        key: 'd_words',
        lines: ['Если хочешь, я помогу подобрать точные слова/действие для следующего семени — уверенно и мягко.'],
      },
      {
        key: 'd_checkin',
        lines: ['Если хочешь, я могу предложить один вопрос‑чек‑ин на завтра, чтобы держать курс.'],
      },
    ],
  },
};

const extractRecentlyUsedOfferKeys = (
  recentAssistantTexts: string[],
  offers: Offer[]
): Set<string> => {
  const used = new Set<string>();
  const haystack = recentAssistantTexts.join('\n\n');
  for (const o of offers) {
    // Use the first line as a lightweight signature.
    const sig = o.lines[0];
    if (sig && haystack.includes(sig)) {
      used.add(o.key);
    }
  }
  return used;
};

const pickOffer = (
  ctx: NextStepOfferContext,
  state: NextStepOfferState,
  recentAssistantTexts: string[]
): Offer | null => {
  const bucket = getBucket(ctx);
  if (bucket === 'none') return null;
  const offers = OFFERS[ctx.language]?.[bucket] ?? OFFERS[ctx.language]?.default ?? [];
  if (!offers.length) return null;

  const rotationKey = `${ctx.language}|${bucket}|${(ctx.category || 'general').toString()}|${(ctx.conversationMode || 'problem').toString()}`;
  const start = state.rotation.get(rotationKey) ?? 0;
  const used = extractRecentlyUsedOfferKeys(recentAssistantTexts, offers);

  // Find the next offer not used in recent assistant messages; fall back to rotation if all are used.
  let chosenIndex = start % offers.length;
  for (let i = 0; i < offers.length; i++) {
    const idx = (start + i) % offers.length;
    if (!used.has(offers[idx].key)) {
      chosenIndex = idx;
      break;
    }
  }

  // Advance rotation for next time.
  state.rotation.set(rotationKey, (chosenIndex + 1) % offers.length);
  return offers[chosenIndex] ?? null;
};

/**
 * Append a ChatGPT-style "If you want, I can..." next-step offer to assistant messages.
 * Designed to be used as a post-processor for AI/system replies.
 */
export function appendNextStepOffer(
  text: string,
  ctx: NextStepOfferContext,
  state: NextStepOfferState,
  recentAssistantTexts: string[] = []
): string {
  const base = text || '';
  if (!base.trim()) return base;
  if (alreadyHasOffer(base)) return base;
  if (looksLikeQuestioningResponse(base)) return base;
  if (ctx.isHeavyTopic) return base;

  const offer = pickOffer(ctx, state, recentAssistantTexts);
  if (!offer) return base;

  const formatted = `\n\n${offer.lines.join('\n')}`;

  // Keep it simple: no extra bullets, just short lines.
  return base + formatted;
}

