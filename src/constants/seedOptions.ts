// Seed options for each problem category
// Used in Phase 4 structured UI

export interface SeedOption {
  id: string;
  emoji: string;
  action: string;
  theyFeel: string;
  youReceive: string;
}

export interface CategorySeeds {
  category: string;
  displayName: string;
  reciprocalLaw: string; // e.g., "Want money? → Give generously."
  oldSeeds: string[];
  mirrorExplanation: string;
  newSeeds: SeedOption[];
}

export const SEED_DATA: Record<string, CategorySeeds> = {
  money: {
    category: 'money',
    displayName: 'Financial Abundance',
    reciprocalLaw: 'Want money? → Give generously with money, time, or help.',
    oldSeeds: [
      "A friend or family member asked to borrow money and you said no when you could have helped",
      "Someone was struggling with bills and asked for help finding work, but you didn't offer any leads",
      "When someone shared financial good news - a raise, bonus, or new job - you felt jealous instead of happy for them",
      "You didn't pay someone fairly for their work, or left a small tip when you could have been generous",
      "You looked down on someone for their financial struggles instead of offering compassion",
    ],
    mirrorExplanation: "When you didn't support others with their financial needs, they felt alone, unsupported, like no one had their back. That feeling of having no safety net. And now - that's exactly what you're experiencing. The feeling you gave is the feeling that came back.",
    newSeeds: [
      {
        id: 'money_1',
        emoji: '💝',
        action: 'Reach out to that person and offer help or apologize',
        theyFeel: "like someone finally has their back",
        youReceive: "support appearing in your financial life",
      },
      {
        id: 'money_2',
        emoji: '👂',
        action: 'Help someone else with their money stress (even just listening)',
        theyFeel: "less alone with their financial worries",
        youReceive: "feeling supported and less alone yourself",
      },
      {
        id: 'money_3',
        emoji: '☕',
        action: "Buy someone's coffee or lunch unexpectedly",
        theyFeel: "a warm surprise - like someone thought of them",
        youReceive: "money appearing in unexpected ways",
      },
      {
        id: 'money_4',
        emoji: '🎉',
        action: "Genuinely celebrate someone's financial win",
        theyFeel: "seen and celebrated for their success",
        youReceive: "people wanting to help YOU succeed",
      },
    ],
  },

  loneliness: {
    category: 'loneliness',
    displayName: 'Connection & Belonging',
    reciprocalLaw: 'Want connection? → Reach out and include others.',
    oldSeeds: [
      "Someone texted or called wanting to connect, and you left them on read or didn't respond",
      "You noticed someone eating alone or looking left out, and didn't invite them to join",
      "An old friend reached out to reconnect, and you never got back to them",
      "Someone new tried to befriend you, and you didn't make them feel welcome",
      "You excluded someone from plans because they didn't quite fit in",
    ],
    mirrorExplanation: "When you didn't respond or didn't include them, that person felt invisible, forgotten, like they didn't matter enough for you to make time. And now - that's exactly what you're feeling. Invisible. Forgotten. Like you don't matter. The feeling you gave is the feeling that came back.",
    newSeeds: [
      {
        id: 'lonely_1',
        emoji: '📱',
        action: 'Text that person back, or reach out to someone you\'ve lost touch with',
        theyFeel: "remembered and valued",
        youReceive: "people reaching out to you unexpectedly",
      },
      {
        id: 'lonely_2',
        emoji: '🤝',
        action: 'Invite someone who looks alone to join you',
        theyFeel: "included and like they belong",
        youReceive: "a growing sense of belonging in your own life",
      },
      {
        id: 'lonely_3',
        emoji: '👁️',
        action: 'Really listen to someone today - full presence, no phone',
        theyFeel: "truly heard and seen",
        youReceive: "people being genuinely present with you",
      },
      {
        id: 'lonely_4',
        emoji: '🌉',
        action: 'Introduce two people who should know each other',
        theyFeel: "valued enough to be thought of",
        youReceive: "a web of connection growing around you",
      },
    ],
  },

  relationship: {
    category: 'relationship',
    displayName: 'Love & Relationships',
    reciprocalLaw: 'Want love? → Give love freely and support others\' relationships.',
    oldSeeds: [
      "You gossiped about someone's relationship or criticized how a couple was together",
      "A friend's relationship was struggling and you didn't check in on them",
      "When you saw happy couples, you felt jealous instead of happy for them",
      "Someone asked for relationship advice and you brushed them off",
      "You did something that damaged trust or hurt someone else's relationship",
    ],
    mirrorExplanation: "When you gossiped, didn't support, or felt jealous of others' relationships, they felt judged, alone, like their love didn't matter. And now - that's what you're experiencing. Feeling judged, unsupported, like your love life doesn't matter. The feeling you gave is the feeling that came back.",
    newSeeds: [
      {
        id: 'rel_1',
        emoji: '💌',
        action: 'Reach out to a friend and check on their relationship',
        theyFeel: "cared for and supported in their love life",
        youReceive: "care and support flowing into your relationships",
      },
      {
        id: 'rel_2',
        emoji: '💑',
        action: 'Compliment a couple genuinely - tell them they\'re great together',
        theyFeel: "celebrated and affirmed",
        youReceive: "positive relationship energy flowing toward you",
      },
      {
        id: 'rel_3',
        emoji: '😊',
        action: 'Feel genuine happiness for the next happy couple you see',
        theyFeel: "that love is celebrated, not envied",
        youReceive: "the feeling that love is abundant and coming your way",
      },
      {
        id: 'rel_4',
        emoji: '🗣️',
        action: 'Really listen and support someone\'s relationship struggles',
        theyFeel: "guided and less alone",
        youReceive: "guidance appearing in your own love life",
      },
    ],
  },

  career: {
    category: 'career',
    displayName: 'Career & Recognition',
    reciprocalLaw: 'Want recognition? → Celebrate and acknowledge others.',
    oldSeeds: [
      "A colleague did great work and you didn't acknowledge it when you could have",
      "You took credit for something that wasn't fully yours",
      "When someone got promoted, you felt bitter instead of celebrating with them",
      "Someone needed a recommendation or referral, and you didn't follow through",
      "You diminished someone's achievements or downplayed their success",
    ],
    mirrorExplanation: "When you didn't acknowledge their work or felt bitter about their success, they felt unseen, unappreciated, like their effort didn't matter. And now - that's exactly what you're experiencing. Unseen. Unappreciated. Stuck. The feeling you gave is the feeling that came back.",
    newSeeds: [
      {
        id: 'career_1',
        emoji: '📣',
        action: 'Acknowledge someone\'s work publicly today',
        theyFeel: "seen and valued for their effort",
        youReceive: "recognition starting to flow toward you",
      },
      {
        id: 'career_2',
        emoji: '🎊',
        action: 'Celebrate someone\'s success genuinely',
        theyFeel: "supported in their wins",
        youReceive: "people championing YOUR success",
      },
      {
        id: 'career_3',
        emoji: '🔗',
        action: 'Give someone a recommendation or referral',
        theyFeel: "valued and helped forward",
        youReceive: "opportunities finding their way to you",
      },
      {
        id: 'career_4',
        emoji: '🤲',
        action: 'Share credit generously on your next project',
        theyFeel: "appreciated and recognized",
        youReceive: "appreciation coming back to you",
      },
    ],
  },

  peace: {
    category: 'peace',
    displayName: 'Peace & Calm',
    reciprocalLaw: 'Want peace? → Bring calm and ease to others.',
    oldSeeds: [
      "Someone needed calm and you brought them stress or drama instead",
      "You added to someone's worries when you could have been reassuring",
      "Someone was going through something hard and you made it about yourself",
      "You disturbed someone's peace when they clearly needed quiet",
      "You created anxiety for someone when you could have been a steady presence",
    ],
    mirrorExplanation: "When you brought stress instead of calm, that person felt more anxious, more overwhelmed, like they couldn't catch a break. And now - that's exactly what you're living. Constant anxiety, no peace, can't catch a break. The feeling you gave is the feeling that came back.",
    newSeeds: [
      {
        id: 'anxiety_1',
        emoji: '🧘',
        action: 'Be the calm presence for someone stressed today',
        theyFeel: "soothed and grounded",
        youReceive: "calm starting to grow in your own life",
      },
      {
        id: 'anxiety_2',
        emoji: '✋',
        action: 'Help someone with a task that\'s overwhelming them',
        theyFeel: "relief from their burden",
        youReceive: "relief flowing into your own life",
      },
      {
        id: 'anxiety_3',
        emoji: '🫂',
        action: 'Listen without judgment when someone needs to vent',
        theyFeel: "unburdened and heard",
        youReceive: "peace and unburdening for yourself",
      },
      {
        id: 'anxiety_4',
        emoji: '🤫',
        action: 'Create a moment of quiet for someone who needs it',
        theyFeel: "cared for and given space",
        youReceive: "tranquility growing in your life",
      },
    ],
  },

  health: {
    category: 'health',
    displayName: 'Health & Vitality',
    reciprocalLaw: 'Want health? → Care for others\' wellbeing.',
    oldSeeds: [
      "Someone was sick and you didn't check on them",
      "You were impatient or annoyed with someone who was unwell or elderly",
      "Someone shared health concerns and you dismissed them",
      "Someone needed physical help and you didn't offer",
      "You judged or criticized someone's body or health choices",
    ],
    mirrorExplanation: "When you didn't check in or dismissed their health concerns, they felt alone, uncared for, like their suffering didn't matter. And now - that's what you're experiencing. Alone in this, like your health struggle doesn't matter. The feeling you gave is the feeling that came back.",
    newSeeds: [
      {
        id: 'health_1',
        emoji: '💐',
        action: 'Check on someone who\'s been unwell',
        theyFeel: "remembered and cared for",
        youReceive: "people caring about your wellbeing",
      },
      {
        id: 'health_2',
        emoji: '👂',
        action: 'Really listen to someone\'s health concerns',
        theyFeel: "heard and validated",
        youReceive: "attention to your own health needs",
      },
      {
        id: 'health_3',
        emoji: '🙌',
        action: 'Help someone with something physical they\'re struggling with',
        theyFeel: "supported in their body",
        youReceive: "support for your own physical wellbeing",
      },
      {
        id: 'health_4',
        emoji: '💕',
        action: 'Be patient and kind with someone who\'s struggling',
        theyFeel: "valued despite their struggles",
        youReceive: "kindness flowing back to you",
      },
    ],
  },

  general: {
    category: 'general',
    displayName: 'Life & Wellbeing',
    reciprocalLaw: 'Want support? → Support others.',
    oldSeeds: [
      "Someone needed help and you looked the other way",
      "Someone was struggling and you didn't offer support",
      "You weren't fully present for someone who needed you",
      "You dismissed someone's concerns when you could have listened",
    ],
    mirrorExplanation: "When you weren't there for them, they felt unseen, unsupported, like they didn't matter. And now - that's what you're experiencing. The feeling you gave is the feeling that came back.",
    newSeeds: [
      {
        id: 'general_1',
        emoji: '💝',
        action: 'Reach out to someone you\'ve neglected',
        theyFeel: "remembered and valued",
        youReceive: "people reaching out to you",
      },
      {
        id: 'general_2',
        emoji: '👂',
        action: 'Really listen to someone today',
        theyFeel: "truly heard and seen",
        youReceive: "feeling heard yourself",
      },
      {
        id: 'general_3',
        emoji: '🤝',
        action: 'Offer help before someone asks',
        theyFeel: "supported and cared for",
        youReceive: "support appearing in your life",
      },
      {
        id: 'general_4',
        emoji: '✨',
        action: 'Be genuinely present with someone',
        theyFeel: "like they matter",
        youReceive: "feeling like you matter too",
      },
    ],
  },
};

// Helper to get category from keywords
// Order matters! Emotional states (peace/calm topics) should be checked before topics (career)
// to avoid misclassification like "stressed about work" → Career instead of Peace
export const detectCategory = (text: string): string => {
  const lower = text.toLowerCase();
  
  // 0. Safety/crisis keywords (HIGHEST PRIORITY - war, violence, severe trauma)
  // NOTE: avoid overly broad words like "hostage" which are often used metaphorically ("my dream is held hostage").
  // IMPORTANT: avoid Russian false-positives like "пожертвовать" (donate) which contains "жертв".
  // We match victim-related forms as standalone words only.
  if (/war|bomb|bombing|genocide|refugee|displaced|conflict zone|military attack|invasion|terror|violence|abuse|assault|rape|attacked|victim|trafficking|kidnap|torture|persecution|flee|escaped|survivor|войн|бомб|обстрел|ракет|взрыв|геноцид|бежен|убежищ|переселен|конфликт|вторжен|террор|насили|абьюз|домашн(ее|е)\s+насили|изнасил|нападен|(?:^|[^А-Яа-яЁё])жертв(?:а|ы|е|у|ой|ам|ами|ах)?(?:$|[^А-Яа-яЁё])|торговл(я|и)\s+люд|похищ|заложник|пытк|преследован|бежал|выжил/.test(lower)) {
    return 'safety';
  }

  // 0.5 Apple Developer / App Store / Expo EAS / build & signing issues (practical admin/tech topics)
  // Keep these as GENERAL so the default meditation is Daily Gratitude Brew (not love/clarity).
  if (/(apple developer|developer program|developer account|apple id|app store connect|appstore connect|testflight|bundle id|provisioning profile|provisioning|certificate|code signing|signing|entitlements|xcode|ios build|build failed|build error|eas build|eas|expo dev|expo account|expo login|expo go|expo project|enroll|enrollment|membership|identity verification|driver'?s license|support team|developer support|разработчик apple|аккаунт разработчика|программа разработчика|app store connect|апп стор коннект|тестфлайт|bundle id|бандл айди|сертификат|профиль подписи|провижининг|подпись кода|xcode|сборк(а|у)\s+ios|сборк(а|у)|eas|expo|enroll|enrollment|вступлени(е|я)|регистраци(я|ю)|членств(о|а)|проверка личности|водительск(ое|ую)\s+удостоверение|служб(а|у)\s+поддержк)/.test(lower)) {
    return 'general';
  }
  
  // 1. Money keywords (very specific intent)
  // Note: Treat promotions/raises as MONEY intent (users expect "abundance/finance" recommendations).
  if (/money|financial|broke|debt|bills|afford|salary|income|rent|poor|rich|wealth|raise|pay rise|salary increase|деньг|денег|денеж|финанс|зарплат|оклад|доход|прибыл|бюджет|долг|кредит|ипотек|счет|счёт|квартплат|аренд|оплат(а|ить)|дорог(о|ая)|не\s+хватает\s+денег|повышени(е|я)(?!\s+температур)/.test(lower)) {
    return 'money';
  }
  
  // 2. Relationship keywords (specific topic - catches "lonely in relationship")
  if (/relationship|love|partner|dating|marriage|boyfriend|girlfriend|single|spouse|romantic|heartbreak|breakup|отношен|любов|партн(е|ё)р|свидан|встречаюсь|брак|замуж|женитьб|развод|втор(ая|ую)\s+половинк|половинк(а|у)|девушк|парен(ь|я)|муж(?!чин)|жена|супруг|романт|расставан|сердц(е|а)\s+разбито/.test(lower)) {
    return 'relationship';
  }
  
  // 3. Competition/Achievement keywords (check BEFORE peace to catch "competition at school")
  if (/competition|compete|competing|award|prize|scholarship|win|winning|winner|tournament|contest|pitch|pitching|presentation|achievement|accomplish|first place|second place|third place|соревнован|соревнов|конкурс|олимпиад|турнир|чемпионат|первенств|состязан|выигра(ть|ю)|побед(а|ить)|призов(ое|ые)|медал(ь|и)|пьедестал/.test(lower)) {
    return 'career';
  }
  
  // 4. Peace/calm keywords (emotional state - check BEFORE career/health to catch "stressed about work/school")
  if (/anxi|stress|worried|peace|calm|overwhelm|panic|restless|can't relax|nervous|exam|study|test|burnout|burnt out|pressure|deadline|тревог|тревож|страх|боюс|паник|стресс|волнуюсь|переживаю|не\s+могу\s+расслаб|не\s+могу\s+успоко|напряжен|давлени(е|я)|выгорел|выгора|дедлайн|экзамен|учеб|контрольн|сесс(ия|ии)|нервничаю|беспоко/.test(lower)) {
    return 'peace';
  }
  
  // 5. Loneliness keywords (emotional state)
  if (/lonely|alone|isolated|no friends|no one|invisible|left out|don't belong|don't fit|excluded|forgotten|одинок|одиночеств|изоляц|нет\s+друзей|нет\s+никого|никто\s+не\s+пишет|никому\s+не\s+нуж|невидим|вне\s+компан|не\s+вписываюсь|меня\s+исключ|забы(л|ли)|брошен/.test(lower)) {
    return 'loneliness';
  }
  
  // 6. Career keywords (topic - checked after peace so "stressed about work" → peace)
  if (/career|job|work|promotion|boss|colleague|undervalued|unappreciated|professional|работ|карьер|повышен|начальник|начальств|шеф|коллег|проект|офис|компан|уволен|увольнен|собеседован|резюме|зарплатн(ый|ая)\s+рост|меня\s+не\s+ценят|недооцен|признан|професси/.test(lower)) {
    return 'career';
  }
  
  // 7. Health keywords (often overlap with stress, so checked last)
  // Include common fitness/weight-loss goals so journeys like "похудеть на 10 кг" map to health.
  if (/health|sick|tired|pain|body|energy|illness|disease|chronic|fatigue|lose weight|weight loss|workout|fitness|gym|diet|здоров|болею|болит|боль|симптом|диагноз|болезн|хрон|усталост|энерги(я|и)\s+нет|врач|температур|сон|бессонниц|тело|фитнес|тренировк|спортзал|диет|питан(ие|ия)|похуд|похуден|сброс(ить|а)\s+вес|лишн(ий|его)\s+вес|(?:^|[^А-Яа-яЁё])вес(?:$|[^А-Яа-яЁё])|(?:^|[^А-Яа-яЁё])кг(?:$|[^А-Яа-яЁё])|килограмм|стройн|стройност|фигура|талия|пресс|подтянут|плоск(ий|ого)\s+живот|живот|давлени(е|я)\s+(?:скачет|высокое)/.test(lower)) {
    return 'health';
  }
  
  return 'general';
};

export default SEED_DATA;




