import { deleteConversation } from './chatStorage';
import { deleteProblem, clearPendingMeditationForConversation } from './meditationStorage';
import { getFirebaseAuth } from './firebase';
import { syncLocalSnapshotsToCloud } from './cloudSync';

/**
 * Delete a journey everywhere (chat + garden).
 *
 * Goal: when the user confirms delete, it should be final and not reappear after
 * cloud restore.
 */
export async function deleteJourneyEverywhere(conversationId: string): Promise<void> {
  // Best-effort cleanup: don't fail the whole operation if one piece throws.
  await Promise.all([
    deleteConversation(conversationId).catch(() => false),
    deleteProblem(conversationId).catch(() => 0),
    clearPendingMeditationForConversation(conversationId).catch(() => false),
  ]);

  // Ensure cloud is updated immediately (don't rely only on debounced sync / restore gating).
  const uid = getFirebaseAuth().currentUser?.uid;
  if (uid) {
    await syncLocalSnapshotsToCloud(uid).catch(() => {});
  }
}

