// Client-specific answers use supplied structured facts, not generated business
// claims. Free-form notes, business category, user assertions and prior assistant
// messages never establish an owned product/service or a new client fact.
function language(message, history=[]) {
  const texts=[message,...history.filter(t=>t.role==='user').slice(-2).reverse().map(t=>t.content)];
  for(const text of texts){if(/[\u0b80-\u0bff]/.test(text))return 'ta';if(/\b(pannu|pannanum|pannunga|enna|venum|sollu|irukka|irukku|theriyuma|pathi|avanga|ivanga|pannalam|pannalama|athu|adhu)\b/i.test(text))return 'tanglish';}
  return 'en';
}
function isGeneric(message) {
  if(/\b(their|its|client'?s|avanga|ivanga)\b|அவர்கள்|அவங்க/.test(message.toLowerCase()))return false;
  return /^(hi|hello|hey|good morning|good evening|thanks|thank you|vanakkam|okay|ok|seri|sari|வணக்கம்|சரி|நன்றி)[!.\s]*$/i.test(message) || /^(what is|what does|explain|define|how does|how are you|translate|calculate|tell me a joke|tell me about|write a poem|seo na enna|seo என்றால் என்ன)/i.test(message.trim()) || /enna pannalam|idea sollu|how can i|என்ன செய்யலாம்|யோசனை/.test(message.toLowerCase());
}
function groundedReply(message,client,history=[]) {
  if(!client)return null;
  const named=client.name && message.toLowerCase().includes(client.name.toLowerCase());
  const previous=history.filter(t=>t.role==='user').at(-1);
  const generalFollowup=previous && isGeneric(previous.content) && !(client.name && previous.content.toLowerCase().includes(client.name.toLowerCase())) && /^(more|continue|explain more|elaborate|adhu|athu|innum)[?.! ]*$/i.test(message);
  if((isGeneric(message)||generalFollowup)&&!named)return null;
  const lang=language(message,history), name=client.name||'Selected client';
  const own=client.productsServices||[],assigned=client.oneLeadQServices||client.services||[];
  const detail=/\b(products?|services?|sell|offer|capabilit|kitchen|interior|price|cost|location|address|phone|contact|website|url|business|client)\b|சேவை|பொருள்|விலை|முகவரி|தொலைபேசி|விவரம்/i.test(message);
  const assignedOnly=/oneleadq|assigned|providing|நாம் வழங்க/i.test(message);
  const facts=[];
  const missing=lang==='ta'?'தகவல் இல்லை':lang==='tanglish'?'details available illa':'not supplied';
  if(/website|url|இணையதள/i.test(message))facts.push(`${lang==='ta'?'இணையதளம்':'Website'}: ${client.website||missing}`);
  if(/location|address|இடம்|முகவரி/i.test(message))facts.push(`${lang==='ta'?'இடம்':'Location'}: ${client.location||missing}`);
  if(/phone|contact|தொலைபேசி/i.test(message))facts.push(`${lang==='ta'?'தொலைபேசி':'Phone'}: ${client.phone||missing}`);
  if(/email|contact|மின்னஞ்சல்/i.test(message))facts.push(`Email: ${client.email||missing}`);
  if(lang==='ta')return `${name}: ${assignedOnly?`OneLeadQ வழங்கும் சேவைகள்: ${assigned.join(', ')||'பதிவு இல்லை'}. இவை வாடிக்கையாளரின் சொந்த சேவைகள் அல்ல.`:`உறுதிப்படுத்தப்பட்ட சொந்த பொருட்கள்/சேவைகள்: ${own.join(', ')||'தகவல் இல்லை'}.`}${detail&&facts.length?'\n'+facts.join('\n'):''}\n${own.length?'விலை, சலுகை, திட்ட அனுபவம் போன்ற கூடுதல் விவரங்கள் உறுதிப்படுத்தப்படவில்லை.':'சொந்த பொருட்கள்/சேவைகளின் உறுதிப்படுத்தப்பட்ட பட்டியலைத் தர முடியுமா?'} குறிப்புகள் அல்லது முந்தைய பதில்களை வைத்து விவரங்களை ஊகிக்க மாட்டேன்.`;
  if(lang==='tanglish')return `${name}: ${assignedOnly?`OneLeadQ provide pannura services: ${assigned.join(', ')||'details illai'}. Idhu client-oda own services list illa.`:`Verified own products/services: ${own.join(', ')||'details innum available illa'}.`}${detail&&facts.length?'\n'+facts.join('\n'):''}\n${own.length?'Prices, offers, project history maadhiri extra facts verify pannala.':'Client-oda verified own products/services list share pannunga.'} Notes illa previous reply vechu business facts guess panna maatten.`;
  return `${name}: ${assignedOnly?`Services OneLeadQ provides: ${assigned.join(', ')||'not supplied'}. These are not the client's own services.`:`Verified client-owned products/services: ${own.join(', ')||'not supplied'}.`}${detail&&facts.length?'\n'+facts.join('\n'):''}\n${own.length?'Additional prices, offers and project history are not verified.':'Please provide the verified client-owned products/services list.'} I will not infer business facts from its category, notes or previous replies.`;
}
function handoffReply(message,client,history=[]){const lang=language(message,history);return lang==='ta'?'இணையதள வேலைக்கான பகுதியைத் திறக்கிறேன். தேர்ந்தெடுத்த வாடிக்கையாளர் மற்றும் அமைக்கப்பட்ட Project ID-ஐ சரிபார்க்கவும். தனி அனுமதி இல்லாமல் கோப்புகள் மாற்றப்படாது.':lang==='tanglish'?'Website workflow open pannuren. Selected client, configured Project ID confirm pannunga. Separate approval illama files change aagathu.':'Opening the website workflow. Review the selected client and explicitly configured project ID. No files change without separate approval.';}
module.exports={isGeneric,groundedReply,handoffReply,language};
