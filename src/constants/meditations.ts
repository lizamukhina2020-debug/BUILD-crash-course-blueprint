// Meditation data for the Coffee Meditations section
export interface Meditation {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
  durationSeconds: number;
  category: 'abundance' | 'relationships' | 'health' | 'peace' | 'clarity';
  description: string;
  imageGradient: [string, string];
  audioKey?: string; // Key to look up in AUDIO_FILES
  isLocked?: boolean;
}

// Audio files organized by voice (female/male)
// Each meditation can have both voice options
export interface VoiceAudioFiles {
  female?: any;
  male?: any;
}

export const AUDIO_FILES: Record<string, VoiceAudioFiles> = {
  abundance: {
    female: require('../../assets/audio/abundance.mp3'),
  },
  gratitude: {
    female: require('../../assets/audio/gratitude.mp3'),
  },
  love: {
    female: require('../../assets/audio/love.mp3'),
  },
  vitality: {
    female: require('../../assets/audio/vitality.mp3'),
  },
  clarity: {
    female: require('../../assets/audio/clarity.mp3'),
  },
};

// Helper to get audio file for a meditation based on voice preference
export const getAudioFile = (audioKey: string | undefined, voice: 'female' | 'male'): any => {
  if (!audioKey || !AUDIO_FILES[audioKey]) return null;
  
  const voiceFiles = AUDIO_FILES[audioKey];
  // Return preferred voice if available, otherwise fall back to the other voice
  return voiceFiles[voice] || voiceFiles.female || voiceFiles.male || null;
};

// Check if a specific voice is available for a meditation
export const hasVoiceOption = (audioKey: string | undefined, voice: 'female' | 'male'): boolean => {
  if (!audioKey || !AUDIO_FILES[audioKey]) return false;
  return !!AUDIO_FILES[audioKey][voice];
};

// Check if both voices are available for a meditation
export const hasBothVoices = (audioKey: string | undefined): boolean => {
  if (!audioKey || !AUDIO_FILES[audioKey]) return false;
  const voiceFiles = AUDIO_FILES[audioKey];
  return !!voiceFiles.female && !!voiceFiles.male;
};

export const meditations: Meditation[] = [
  {
    id: '1',
    title: 'Planting Seeds of Abundance',
    subtitle: 'For Financial Wellbeing',
    duration: '3:43',
    durationSeconds: 223,
    category: 'abundance',
    description: 'Discover how small acts of generosity today create ripples of prosperity in your tomorrow. Like a coffee bean that transforms into a rich brew, your kind actions transform into abundance.',
    imageGradient: ['#5C3D2E', '#8B6B4D'],
    audioKey: 'abundance',
  },
  {
    id: '2',
    title: 'The Mirror of Love',
    subtitle: 'For Relationships',
    duration: '3:39',
    durationSeconds: 219,
    category: 'relationships',
    description: 'See how the love you give reflects back to you. When you water the seeds of compassion, beautiful relationships bloom in the garden of your life.',
    imageGradient: ['#B87333', '#D4A574'],
    audioKey: 'love', // Audio will be loaded when files are added
  },
  {
    id: '3',
    title: 'Seeds of Vitality',
    subtitle: 'For Health & Energy',
    duration: '3:46',
    durationSeconds: 226,
    category: 'health',
    description: 'Your body is a garden. Learn how caring for others plants seeds of wellness that blossom into vibrant health and boundless energy.',
    imageGradient: ['#6B8E5A', '#9CAF88'],
    audioKey: 'vitality', // Audio will be loaded when files are added
  },
  {
    id: '4',
    title: 'Daily Gratitude Brew',
    subtitle: 'Daily Reflection',
    duration: '4 min',
    durationSeconds: 238,
    category: 'peace',
    description: 'Like savoring the last sip of your favorite coffee, this meditation helps you appreciate the seeds you planted today and prepare for tomorrow\'s harvest.',
    imageGradient: ['#4A3728', '#6B5344'],
    audioKey: 'gratitude', // Audio will be loaded when files are added
  },
  {
    id: '5',
    title: 'Clarity Through Giving',
    subtitle: 'For Mental Clarity',
    duration: '3:50',
    durationSeconds: 230,
    category: 'clarity',
    description: 'When the mind feels clouded, remember: helping others find their way clears the fog in your own path. Plant seeds of guidance, harvest clarity.',
    imageGradient: ['#7B6855', '#A89880'],
    audioKey: 'clarity',
  },
  {
    id: '6',
    title: 'The Coffee Shop of the Soul',
    subtitle: 'Finding Inner Peace',
    duration: '3 min',
    durationSeconds: 180,
    category: 'peace',
    description: 'Imagine a cozy corner in the coffee shop of your soul. Here, you learn how each act of kindness is like a warm cup that fills your heart with peace.',
    imageGradient: ['#8B5A3C', '#C4926A'],
    audioKey: 'soul', // Audio will be loaded when files are added
    isLocked: true,
  },
];

export const categories = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'abundance', label: 'Abundance', icon: '🌱' },
  { id: 'relationships', label: 'Love', icon: '💝' },
  { id: 'health', label: 'Health', icon: '🌿' },
  { id: 'peace', label: 'Peace', icon: '☕' },
  { id: 'clarity', label: 'Clarity', icon: '🔮' },
];

