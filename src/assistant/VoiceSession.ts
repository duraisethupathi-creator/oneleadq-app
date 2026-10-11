// Native events have no session ID. Hold ownership until terminal end, and
// consume only once. Continuous Android recognition emits multiple final segments.
export class VoiceSession {
  private nextId = 0;
  current: {
    id: number; transcript: string; final: boolean; cancelled: boolean; started: boolean;
    continuous: boolean; committed: string[];
  } | null = null;
  begin(continuous = false): number | null {
    if (this.current) return null;
    const id = ++this.nextId;
    this.current = { id, transcript: '', final: false, cancelled: false, started: false, continuous, committed: [] };
    return id;
  }
  start() { if (this.current && !this.current.cancelled) this.current.started = true; }
  result(transcript: string, final: boolean) {
    const session = this.current;
    if (!session || session.cancelled || !session.started) return;
    const text = transcript.trim();
    if (!text) return;
    if (session.continuous) {
      if (final) session.committed.push(text);
      session.transcript = [...session.committed, ...(final ? [] : [text])].join(' ');
      session.final = session.committed.length > 0;
    } else if (!session.final) {
      session.transcript = text;
      session.final = final;
    }
  }
  discardUnstarted() { if (this.current && !this.current.started) this.current = null; }
  cancel() { if (this.current) { this.current.cancelled = true; this.current.transcript = ''; this.current.committed = []; } }
  end(): string | null {
    const session = this.current;
    this.current = null;
    if (!session || session.cancelled || !session.final) return null;
    // Unfinalized trailing interim speech is shown but never silently submitted.
    const text = session.continuous ? session.committed.join(' ') : session.transcript;
    return text || null;
  }
}
