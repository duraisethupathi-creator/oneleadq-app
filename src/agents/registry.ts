export type ServiceId = 'webDevelopment' | 'mobileDevelopment' | 'seo' | 'metaAds' | 'googleAds' | 'content' | 'automation' | 'youtube';
export type ServiceStatus = 'IMPLEMENTED' | 'PARTIAL' | 'PLANNED';
export const serviceRegistry: ReadonlyArray<{id:ServiceId;name:string;status:ServiceStatus;capabilities:readonly string[]}> = [
  {id:'webDevelopment',name:'Website Development',status:'PARTIAL',capabilities:['authenticated website drafts','design previews','separate approval gates']},
  {id:'mobileDevelopment',name:'Mobile Application Development',status:'PLANNED',capabilities:[]},
  {id:'seo',name:'SEO & Local SEO',status:'PARTIAL',capabilities:['draft advice','static website audit through Website workflow']},
  {id:'metaAds',name:'Meta Ads Management',status:'PARTIAL',capabilities:['draft advice only']},
  {id:'googleAds',name:'Google Ads Management',status:'PARTIAL',capabilities:['draft advice only']},
  {id:'content',name:'Social Media Content Creation',status:'PARTIAL',capabilities:['draft copy only']},
  {id:'automation',name:'Business Automation',status:'PLANNED',capabilities:[]},
  {id:'youtube',name:'YouTube Growth & Channel Management',status:'PLANNED',capabilities:[]},
];
export type AgencyIntent = {kind:'general'} | {kind:'route';serviceId:ServiceId;backendId:string} | {kind:'clarify';choices:ServiceId[];question:string} | {kind:'unavailable';serviceId:ServiceId;message:string};
export function resolveAgencyIntent(message: string): AgencyIntent {
  const text=message.trim();
  const action=/\b(create|build|generate|write|improve|audit|review|check|manage|launch|setup|set up|automate|plan|strategy|pannu|pannunga|choose)\b|உருவாக்கு|செய்|சரிபார்|மேம்படுத்து/i.test(text);
  if (!action || /^(what is|explain|meaning|hi\b|hello\b)|na enna/i.test(text)) return {kind:'general'};
  // Classify the requested object, not descriptive business facts following "for".
  const subject=text.split(/\bfor\b/i)[0];
  const patterns: Array<[ServiceId,RegExp]>=[['webDevelopment',/website|web development|landing page|இணையதளம்/i],['mobileDevelopment',/mobile app|android app|ios app|மொபைல்/i],['seo',/\bseo\b|google maps|google business|local ranking/i],['metaAds',/meta ads|facebook ads|instagram ads/i],['googleAds',/google ads|search ads|\bppc\b|\bpmax\b/i],['content',/social media content|caption|blog|reel script|\bcontent\b/i],['automation',/business automation|automate|workflow automation/i],['youtube',/youtube|யூடியூப்/i]];
  const choices=patterns.filter(([,pattern])=>pattern.test(subject)).map(([id])=>id);
  if (!choices.length && /\bads\b|advertis|விளம்பர/i.test(subject)) return {kind:'clarify',choices:['metaAds','googleAds'],question:'Which ads service do you want: Meta Ads or Google Ads? / எந்த விளம்பரம்?'};
  if(choices.length===2 && choices.includes('webDevelopment') && choices.includes('seo') && !/\band\b|&|மேலும்/i.test(subject))return {kind:'route',serviceId:'webDevelopment',backendId:'webDevelopment'};
  if (choices.length>1) return {kind:'clarify',choices,question:'Choose one service first: '+choices.map(id=>serviceRegistry.find(s=>s.id===id)!.name).join(' or ')+'. No action has started.'};
  if (!choices.length) return {kind:'general'};
  const service=serviceRegistry.find(s=>s.id===choices[0])!;
  if (service.status==='PLANNED') return {kind:'unavailable',serviceId:service.id,message:service.name+' is planned. No execution integration is available; no work or external action was performed.'};
  return {kind:'route',serviceId:service.id,backendId:service.id==='seo' && /local seo|google maps|google business|local ranking/i.test(subject)?'localSeo':service.id};
}
