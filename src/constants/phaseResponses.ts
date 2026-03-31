// Warm, human responses for each phase
// These are structured templates that feel like a caring psychologist

export interface PhaseResponse {
  phase1: string;
  phase2: string;
}

export const PHASE_RESPONSES: Record<string, PhaseResponse> = {
  money: {
    phase1: `I really hear you... financial stress has this way of touching everything, doesn't it? It's not just about the numbers on a screen - it's the worry that follows you to bed, the tightness in your chest when bills come, maybe even a quiet voice wondering if you'll ever feel truly secure.

That weight is real. And it makes complete sense that you're carrying it.

When you sit with this feeling, what comes up strongest for you? Is it fear about the future? Frustration that you're not where you thought you'd be? Something else entirely?`,

    phase2: `I want to share something with you that might help make sense of what's happening. There's a pattern in how life works – it acts like a mirror. What we experience tends to reflect what we've given others. Not as punishment, but as cause and effect.

So I'm curious... can you think back to a time – maybe recently, maybe years ago – when you took money that wasn't fully yours? Or kept money you should have shared? When someone asked to borrow money and you refused even though you could have helped? Did you ever not pay someone what they deserved, or feel jealous when others got money instead of genuinely happy for them?

There's no judgment here. I'm asking because the seed for not having money is usually taking or withholding it from others.`,
  },

  loneliness: {
    phase1: `Oh, that feeling of loneliness... it's one of the most painful human experiences, and I'm really glad you're sharing this with me. It's like there's this invisible wall between you and everyone else - you could be in a room full of people and still feel completely alone. Like no one really sees you.

That ache is real. And you don't have to pretend it's not.

Tell me - when the loneliness hits hardest, what does it feel like? Invisible? Forgotten? Like you don't belong? Something else?`,

    phase2: `I want to share something with you that might help make sense of this. Life works like a mirror – we tend to experience what we've caused others to experience. Not as punishment, but as cause and effect.

So I'm curious... can you think back to a time when you made someone else feel lonely or excluded? Maybe you left someone out, ignored someone who wanted to connect, or made someone feel invisible or unwanted? Did you ever ghost someone, leave them on read, or not invite someone who was clearly alone?

I'm not asking to make you feel bad. I'm asking because the seed for feeling lonely is usually making others feel lonely.`,
  },

  relationship: {
    phase1: `Relationships can bring so much pain when they're not working the way we hope... I can feel the weight in what you're sharing. That exhausting cycle of trying and trying, of giving pieces of yourself, and somehow still feeling like something's missing. It's draining - emotionally, mentally, all of it.

Your heart matters, and what you're going through is real.

When you think about your relationship struggles, what feeling is loudest? Unloved? Misunderstood? Alone even when you're with someone? Something else?`,

    phase2: `I want to share something with you that might help make sense of this pattern. Life works like a mirror – we experience what we've caused others to experience. Not to punish us, but simply as cause and effect.

So I'm curious... can you think back to a time when you harmed someone's experience of love? Maybe you came between people, broke up a relationship, or made someone feel unloved or unwanted? Did you withhold affection from someone who needed it? Gossip negatively about someone's partner? Feel jealous of happy couples instead of genuinely happy for them?

There's no judgment here. I'm asking because the seed for relationship struggles is usually harming others' experience of love.`,
  },

  career: {
    phase1: `That feeling of being stuck in your career... I really hear you. It's watching others move forward while you feel like you're running in place. Putting in the effort, showing up, doing the work - and somehow still feeling invisible, unrecognized, like you're not getting what you deserve.

That frustration is completely valid. And it's exhausting to carry.

When you sit with this, what feeling comes up strongest? Being undervalued? Trapped? Invisible? Like no matter what you do, it's not enough?`,

    phase2: `I want to share something with you that might help explain what's happening. Life works like a mirror – we experience what we've caused others to experience. Not as punishment, but as simple cause and effect.

So I'm curious... can you think back to a time when you blocked someone else's recognition or success? Did you ever take credit for someone else's work? Speak badly about a colleague? Block someone's promotion or opportunity? Feel bitter when someone succeeded instead of celebrating them? Not give praise when someone deserved it?

I'm not asking to make you feel guilty. I'm asking because the seed for not being recognized is usually not recognizing others.`,
  },

  peace: {
    phase1: `That constant hum of stress, never being able to settle into true calm... I hear how exhausting that is. It's like your mind won't let you rest - always spinning, always on alert, always waiting for the next thing. You deserve peace, and I'm sorry it feels so far away right now.

What you're feeling is real, and it's valid.

When it’s at its loudest, what does it feel like inside? Is it fear? Racing thoughts? A sense that something bad is coming? That you can never quite relax?`,

    phase2: `I want to share something with you that might help make sense of this. Life works like a mirror – we experience what we've caused others to experience. Not to punish us, but as cause and effect.

So I'm curious... can you think back to a time when you caused stress for someone else? Did you ever pressure someone with demands or deadlines? Annoy or irritate someone repeatedly? Add to someone's burden when they were already overwhelmed? Criticize someone harshly? Make someone's life harder when they were already stretched thin?

There's no judgment in this. I'm asking because the seed for feeling stressed is usually causing stress in others.`,
  },

  health: {
    phase1: `I'm really sorry you're dealing with health challenges. When your body isn't cooperating, everything feels harder - it affects your mood, your energy, your ability to do the things you want to do. And it can feel so isolating, like no one really understands what you're going through.

Your struggle is real, and you matter.

What's been the hardest part of this for you? The physical pain? The exhaustion? Feeling like your body has betrayed you? Something else?`,

    phase2: `I want to share something that might help make sense of this. Life works like a mirror – we experience what we've caused others to experience. Not as punishment, but as cause and effect.

So I'm curious... can you think back to a time when you harmed someone else's wellbeing? Did you ever cause someone physical pain or discomfort? Be careless with someone's health or safety? Make someone's illness or recovery harder? Were you impatient with someone who was unwell, or ignore someone who was suffering?

I'm not asking to add to your burden. I'm asking because the seed for health struggles is usually harming others' wellbeing.`,
  },

  general: {
    phase1: `Thank you for sharing this with me. I can hear that you're going through something difficult, and I want you to know that what you're feeling is valid and real. You don't have to carry this alone.

Sometimes just naming what we're feeling can help us understand it better.

What's weighing on you the most right now? What feeling is loudest?`,

    phase2: `I want to share something with you that might help make sense of this. Life works like a mirror – we tend to experience what we've caused others to experience. Not as punishment, but as cause and effect.

So I'm curious... can you think back to a time when you caused someone else to feel the way you're feeling now? Maybe you made someone experience this same kind of struggle or pain?

There's no judgment here. I'm asking because the seed for what we experience is usually causing that same experience for others.`,
  },
};

// Button labels for phase transitions
export const PHASE_BUTTONS = {
  afterPhase1: "I'm ready to explore why this might be happening →",
  afterPhase2Yes: "Yes, something comes to mind",
  afterPhase2Think: "Let me sit with this",
};

// Shorter responses for experienced users (who've completed at least 1 conversation)
// These skip the lengthy explanations and get straight to the point
export const EXPERIENCED_USER_RESPONSES: Record<string, PhaseResponse> = {
  money: {
    phase1: `I hear you. Financial stress is heavy. 💛

What's weighing on you most right now?`,

    phase2: `Let's explore the mirror... Did you ever take money that wasn't yours, keep money you should have shared, or refuse to help someone when you could have? The seed for not having is usually taking or withholding.`,
  },

  loneliness: {
    phase1: `That feeling of disconnection is painful. I'm here. 💛

Tell me what's coming up for you.`,

    phase2: `Let's explore the mirror... Did you ever make someone feel excluded, ignored, or invisible? Leave someone out or ghost them? The seed for feeling lonely is usually making others feel lonely.`,
  },

  relationship: {
    phase1: `Relationship struggles can be exhausting. I hear you. 💛

What's weighing on you most?`,

    phase2: `Let's explore the mirror... Did you ever harm someone's experience of love? Come between people, make someone feel unloved, or withhold affection? The seed for relationship struggles is usually harming others' love.`,
  },

  career: {
    phase1: `That stuck feeling at work is frustrating. I get it. 💛

What's the hardest part right now?`,

    phase2: `Let's explore the mirror... Did you ever take credit for someone's work, block their opportunity, or feel bitter instead of celebrating their success? The seed for not being recognized is usually not recognizing others.`,
  },

  peace: {
    phase1: `That constant worry is exhausting. You deserve peace. 💛

What does it feel like when it's loudest?`,

    phase2: `Let's explore the mirror... Did you ever cause stress for someone else? Pressure them, annoy them, add to their burden, or make their life harder? The seed for feeling stressed is usually causing stress in others.`,
  },

  health: {
    phase1: `I'm sorry you're dealing with health challenges. It affects everything. 💛

What's been the hardest part?`,

    phase2: `Let's explore the mirror... Did you ever harm someone's wellbeing? Cause them pain, be careless with their health, or make their recovery harder? The seed for health struggles is usually harming others' wellbeing.`,
  },

  general: {
    phase1: `I hear you. What you're feeling is valid. 💛

What's weighing on you most?`,

    phase2: `Let's explore the mirror... Did you ever cause someone to feel the way you're feeling now? The seed for what we experience is usually causing that same experience for others.`,
  },
};
