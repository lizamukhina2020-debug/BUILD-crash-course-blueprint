export type CloudRestorePhase = 'idle' | 'restoring' | 'done' | 'error';

export type CloudRestoreState = {
  uid: string | null;
  phase: CloudRestorePhase;
  error?: string;
  at: number;
};

let state: CloudRestoreState = { uid: null, phase: 'idle', at: Date.now() };
const listeners = new Set<(s: CloudRestoreState) => void>();

export function getCloudRestoreState(): CloudRestoreState {
  return state;
}

export function subscribeCloudRestore(cb: (s: CloudRestoreState) => void): () => void {
  listeners.add(cb);
  // Immediately hydrate subscriber.
  try {
    cb(state);
  } catch {
    // ignore
  }
  return () => {
    listeners.delete(cb);
  };
}

export function setCloudRestoreState(next: Partial<CloudRestoreState>): void {
  state = {
    ...state,
    ...next,
    at: Date.now(),
  };
  for (const l of listeners) {
    try {
      l(state);
    } catch {
      // ignore
    }
  }
}

