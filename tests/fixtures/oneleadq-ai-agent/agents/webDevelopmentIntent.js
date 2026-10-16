"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webDevelopmentIntent = webDevelopmentIntent;
// Shared with the backend. This detects a requested handoff, never authorization
// to create a workflow, select a repository, write, commit or push.
function webDevelopmentIntent(message, history = []) {
    const text = message.normalize('NFKC').toLowerCase().trim();
    if (!text || text.length > 6000)
        return null;
    const discussion = /\b(what is|what does|explain|meaning|na enna|enna pannalam|enna seyyalam|idea sollu|ideas?|how can i|how do i|should i|can i|could i|pannalama|pathi pesalam)\b|என்ன செய்யலாம்|எப்படி|யோசனை|என்றால் என்ன|விளக்கு|பற்றி பேச/;
    const negated = /\b(don['’]?t|do not|not now|cancel|stop|vendam|venam|pannathe|pannadha)\b|வேண்டாம்|செய்யாதே|நிறுத்து/;
    if (discussion.test(text) || negated.test(text))
        return null;
    const subject = /\b(website|web site|site|web development|landing page)\b|இணையதள|வலைத்தள|வெப்சைட்/;
    const action = /\b(create|build|upgrade|analy[sz]e|audit|improve|optimi[sz]e|check|fix|review|start|pannu|pannunga|pannanum|pannanumnu|seyyu|seiyanum)\b|உருவாக்கு|உருவாக்கணும்|உருவாக்க வேண்டும்|மேம்படுத்து|மேம்படுத்தணும்|ஆய்வு செய்|சரிபார்|பண்ணு|தொடங்கு/;
    if (!action.test(text))
        return null;
    let scoped = text;
    if (!subject.test(text)) {
        if (/\b(seo|ads|caption|content|campaign|ranking)\b/.test(text) || text.length > 120)
            return null;
        const last = history.slice(-8).filter(turn => turn.role === 'user').at(-1);
        if (!last || !subject.test(last.content.toLowerCase()))
            return null;
        scoped += ' ' + last.content.toLowerCase();
    }
    const analyze = /\b(analy[sz]e|audit|check|review)\b|ஆய்வு|சரிபார்/.test(scoped);
    const existing = /\b(upgrade|existing|improve|fix|optimi[sz]e)\b|மேம்படுத்து|மேம்படுத்தணும்/.test(scoped);
    const create = /\b(create|build|new)\b|உருவாக்க/.test(scoped);
    return { mode: create && !existing && !analyze ? 'CREATE_NEW' : 'UPGRADE_EXISTING', intent: analyze ? 'analyze' : create && !existing ? 'create' : 'upgrade' };
}
