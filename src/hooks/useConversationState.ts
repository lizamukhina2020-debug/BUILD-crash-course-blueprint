import { useState, useCallback } from 'react';
import { detectCategory } from '../constants/seedOptions';

export type ConversationPhase = 1 | 2 | 3 | 4 | 5;

export interface ConversationState {
  phase: ConversationPhase;
  category: string;
  acknowledgedSeed: string | null;
  chosenSeed: string | null;
  messageCount: number;
}

const initialState: ConversationState = {
  phase: 1,
  category: 'general',
  messageCount: 0,
  acknowledgedSeed: null,
  chosenSeed: null,
};

// Keywords that indicate user is acknowledging past behavior
const ACKNOWLEDGMENT_PATTERNS = [
  /^yeah/i, /^yes/i, /^actually/i, /^i did/i, /^i remember/i,
  /there was a time/i, /i think i/i, /maybe i/i, /i guess i/i,
  /probably when/i, /i wasn't there/i, /i didn't help/i, 
  /i didn't share/i, /a friend asked/i, /someone needed/i,
  /someone asked/i, /i could have/i, /i should have/i,
  /i was jealous/i, /i felt jealous/i, /i took credit/i,
  /i didn't acknowledge/i, /i left them/i, /i never/i,
  /i forgot/i, /i ignored/i, /when .+ asked/i,
];

// Check if message is acknowledging past behavior
const isAcknowledgment = (message: string): boolean => {
  return ACKNOWLEDGMENT_PATTERNS.some(pattern => pattern.test(message));
};

// Check if message contains only emotional words (no problem category)
const isPureEmotionalResponse = (message: string): boolean => {
  const emotionalPatterns = /feel|feeling|stressed|worried|anxious|scared|frustrated|angry|sad|overwhelmed|exhausted|hopeless|stuck|lost|broken|heavy|painful|fear|tired/i;
  const hasEmotion = emotionalPatterns.test(message);
  const category = detectCategory(message);
  return hasEmotion && category === 'general';
};

export function useConversationState() {
  const [state, setState] = useState<ConversationState>(initialState);

  // Process user message and determine phase transition
  const processUserMessage = useCallback((message: string): ConversationState => {
    const newState = { ...state };
    newState.messageCount += 1;

    // Detect category if not set or if this message has a clearer category
    const detectedCategory = detectCategory(message);
    if (detectedCategory !== 'general') {
      newState.category = detectedCategory;
    }

    // Phase transition logic
    switch (state.phase) {
      case 1:
        // After Phase 1, any response moves to Phase 2
        // (User shared feelings in response to our question)
        newState.phase = 2;
        break;

      case 2:
        // In Phase 2, if user acknowledges something → Phase 3
        if (isAcknowledgment(message)) {
          newState.phase = 3;
          newState.acknowledgedSeed = message;
        }
        // Otherwise stay in Phase 2 (maybe they need more exploration)
        break;

      case 3:
        // Phase 3 automatically flows to Phase 4 (shown together)
        // If somehow we get a message here, move to 4
        newState.phase = 4;
        break;

      case 4:
        // User selected a seed → Phase 5
        newState.phase = 5;
        newState.chosenSeed = message;
        break;

      case 5:
        // Conversation complete, could reset or continue
        break;
    }

    setState(newState);
    return newState;
  }, [state]);

  // Manually set phase (for structured UI elements)
  const setPhase = useCallback((phase: ConversationPhase) => {
    setState(prev => ({ ...prev, phase }));
  }, []);

  // Set chosen seed (when user taps a seed button)
  const selectSeed = useCallback((seedId: string, seedAction: string) => {
    setState(prev => ({
      ...prev,
      phase: 5,
      chosenSeed: seedAction,
    }));
  }, []);

  // Reset conversation
  const resetConversation = useCallback(() => {
    setState(initialState);
  }, []);

  // Determine what type of response is needed
  const getResponseType = useCallback((): 'ai_empathy' | 'ai_exploration' | 'structured_aha' | 'structured_seeds' | 'structured_meditation' => {
    switch (state.phase) {
      case 1:
        return 'ai_empathy';
      case 2:
        return 'ai_exploration';
      case 3:
        return 'structured_aha';
      case 4:
        return 'structured_seeds';
      case 5:
        return 'structured_meditation';
      default:
        return 'ai_empathy';
    }
  }, [state.phase]);

  return {
    state,
    processUserMessage,
    setPhase,
    selectSeed,
    resetConversation,
    getResponseType,
    isAcknowledgment,
  };
}

export default useConversationState;


