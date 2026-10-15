import type { ConversationTurn } from '../services/aiAgent';
export class ConversationMemory {
  private clientId: string | null = null;
  private turns: ConversationTurn[] = [];
  clear() { this.turns = []; }
  forClient(clientId: string | null) {
    if (this.clientId !== clientId) { this.clientId = clientId; this.clear(); }
    return this.turns.map(turn => ({ ...turn }));
  }
  append(clientId: string | null, question: string, reply: string) {
    this.forClient(clientId);
    if (/-----BEGIN|(?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]|\bbearer\s+\S+|https?:\/\/[^\s/"'<>:@]+:[^\s/"'<>@]+@|\b(?:sk-|AIza|ghp_)/i.test(question + '\n' + reply)) return;
    this.turns.push({ role: 'user', content: question.slice(0, 2000), clientId }, { role: 'assistant', content: reply.slice(0, 2000), clientId });
    while (this.turns.length > 8 || this.turns.reduce((size, turn) => size + turn.content.length, 0) > 10000) this.turns.splice(0, 2);
  }
}
