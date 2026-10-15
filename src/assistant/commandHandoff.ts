// One-shot in-memory handoff. Commands and client facts are never persisted here.
export type PendingAICommand = { text: string; clientId: string | null };
let pending: PendingAICommand | null = null;
export function queueAICommand(text: string, clientId: string | null) {
  const clean = text.trim();
  if (!clean || clean.length > 3000) throw new Error('Enter a request between 1 and 3000 characters.');
  pending = { text: clean, clientId };
}
export function consumeAICommand(): PendingAICommand | null {
  const command = pending;
  pending = null;
  return command;
}
