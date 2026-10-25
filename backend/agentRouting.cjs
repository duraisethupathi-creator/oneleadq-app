'use strict';
// Server-owned metadata; provider text can never choose its own agent identity.
function conversationAgent(command){
 let data;try{data=JSON.parse(command);}catch{throw Error('Invalid scoped conversation');}
 const text=data.message;if(typeof text!=='string')throw Error('Invalid scoped conversation');
 if(/^(what is|explain|meaning|hi\b|hello\b)|na enna/i.test(text)||!/\b(create|build|generate|write|give|improve|audit|review|check|manage|launch|setup|set up|automate|plan|strategy|pannu|pannunga|choose)\b|உருவாக்கு|செய்|சரிபார்|மேம்படுத்து/i.test(text))return 'general';
 const subject=text.split(/\bfor\b/i)[0];
 if(/local seo|google maps|google business|local ranking|\bgbp\b/i.test(subject))return 'localSeo';
 if(/\bseo\b|search engine|organic traffic/i.test(subject))return 'seo';
 return 'general';
}
module.exports={conversationAgent};
