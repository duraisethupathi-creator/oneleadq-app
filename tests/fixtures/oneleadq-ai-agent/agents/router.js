const AGENTS = {
  seo: {
    name: "SEO Agent",
    keywords: [
      "seo",
      "keyword",
      "ranking",
      "organic traffic",
      "search engine",
      "on page",
      "technical seo",
      "backlink",
    ],
  },

  localSeo: {
    name: "Local SEO Agent",
    keywords: [
      "local seo",
      "google business",
      "google business profile",
      "gbp",
      "google maps",
      "local ranking",
      "near me",
    ],
  },

  metaAds: {
    name: "Meta Ads Agent",
    keywords: [
      "meta ads",
      "facebook ads",
      "instagram ads",
      "facebook campaign",
      "instagram campaign",
      "meta campaign",
    ],
  },

  googleAds: {
    name: "Google Ads Agent",
    keywords: [
      "google ads",
      "google ad",
      "google campaign",
      "search ads",
      "display ads",
      "performance max",
      "pmax",
      "cpc",
      "ppc",
    ],
  },

  content: {
    name: "Content Agent",
    keywords: [
      "content",
      "caption",
      "blog",
      "post",
      "reel script",
      "headline",
      "description",
      "social media",
    ],
  },

  webDevelopment: {
    name: "Web Development Agent",
    keywords: [
      "website",
      "web development",
      "html",
      "css",
      "javascript",
      "react",
      "wordpress",
      "landing page",
    ],
  },
};

function detectAgent(message = "", history = []) {
  if(require('./webDevelopmentIntent').webDevelopmentIntent(message,history))return {id:'webDevelopment',name:AGENTS.webDevelopment.name,score:100};
  const intent = /\b(audit|analy[sz]e|improve|optimi[sz]e|create|write|generate|build|fix|setup|set up|check|review|prepare|strategy|plan|pannu|pannunga|seyyu)\b|பண்ணு|செய்|உருவாக்கு|சரிபார்/i;
  const casual = /^(hi|hello|hey|thanks|thank you|vanakkam)\b|\b(what is|what does|explain|meaning|na enna|pathi pesalam)\b|என்றால் என்ன/i;
  const general = { id: 'general', name: 'General AI Agent', score: 0 };
  if (casual.test(message) || !intent.test(message)) return general;
  // A short follow-up can inherit subject words, never execution authority.
  if (!/seo|ranking|ads|caption|content|website|web development|landing page/i.test(message)) {
    const subject = [...history].reverse().find(t => t.role === 'user' && /seo|ranking|ads|caption|website/i.test(t.content));
    if (subject) message += ' ' + subject.content;
  }
  if (/local ranking|google maps|google business|gbp/i.test(message)) return { id: 'localSeo', name: AGENTS.localSeo.name, score: 100 };
  if (/website.*(?:analy[sz]e|audit)|(?:analy[sz]e|audit).*website/i.test(message)) return { id: 'webDevelopment', name: AGENTS.webDevelopment.name, score: 100 };

  const text = message.toLowerCase();

  // Strong intent routing first.
  // This prevents generic words such as "keyword"
  // from overriding Google Ads / Local SEO intent.

  if (
    text.includes("google ads") ||
    text.includes("google ad") ||
    text.includes("google campaign") ||
    text.includes("search ads") ||
    text.includes("display ads") ||
    text.includes("performance max") ||
    text.includes("pmax") ||
    text.includes("ppc")
  ) {
    return {
      id: "googleAds",
      name: AGENTS.googleAds.name,
      score: 100,
    };
  }

  if (
    text.includes("meta ads") ||
    text.includes("facebook ads") ||
    text.includes("instagram ads") ||
    text.includes("facebook campaign") ||
    text.includes("instagram campaign") ||
    text.includes("meta campaign")
  ) {
    return {
      id: "metaAds",
      name: AGENTS.metaAds.name,
      score: 100,
    };
  }

  if (
    text.includes("local seo") ||
    text.includes("google business") ||
    text.includes("google business profile") ||
    text.includes("google maps") ||
    text.includes("local ranking") ||
    text.includes("near me")
  ) {
    return {
      id: "localSeo",
      name: AGENTS.localSeo.name,
      score: 100,
    };
  }

  let bestAgent = {
    id: "general",
    name: "General AI Agent",
    score: 0,
  };

  for (const [id, agent] of Object.entries(AGENTS)) {
    let score = 0;

    for (const keyword of agent.keywords) {
      if (text.includes(keyword)) {
        score++;
      }
    }

    if (score > bestAgent.score) {
      bestAgent = {
        id,
        name: agent.name,
        score,
      };
    }
  }

  return bestAgent;
}

module.exports = {
  detectAgent,
  AGENTS,
};