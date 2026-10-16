const { demand, hash, hasSecret } = require('./safety');
const TYPES = [
 ['BUSINESS','Business / Corporate','services,about,contact','Expertise,Capabilities,About,Contact','Contact us','Organization'],
 ['INTERIOR','Interior Design / Home Decor','services,projects,gallery,contact','Spaces,Services,Projects,Process,Contact','Discuss your space','Service'],
 ['CONSTRUCTION','Construction / Real Estate','services,projects,about,contact','Projects,Capabilities,Process,Contact','Discuss your project','Service'],
 ['ECOMMERCE','E-commerce','products,about,contact','Collections,Products,Ordering,Contact','Enquire about a product','Product'],
 ['CATALOGUE','Product Catalogue','products,gallery,contact','Catalogue,Details,Enquiry,Contact','Request product details','Product'],
 ['SERVICE','Service Business','services,about,contact','Services,Process,Questions,Contact','Discuss your requirements','Service'],
 ['PORTFOLIO','Portfolio','projects,about,contact','Selected work,Approach,About,Contact','Start a conversation','CreativeWork'],
 ['LANDING','Landing Page / Lead Generation','about,contact','Overview,Value,Process,Contact','Make an enquiry','Organization'],
 ['RESTAURANT','Restaurant / Food','products,gallery,contact','Food,Space,Visit,Contact','Ask about availability','Restaurant'],
 ['HOTEL','Hotel / Resort','services,gallery,contact','Stay,Experiences,Gallery,Contact','Enquire about your stay','LodgingBusiness'],
 ['EDUCATION','Education / Training','services,about,contact','Learning,Programmes,Approach,Contact','Ask about a programme','EducationalOrganization'],
 ['HEALTHCARE','Healthcare / Clinic','services,about,contact','Services,Visit information,Team,Contact','Request appointment information','MedicalClinic'],
 ['BEAUTY','Beauty / Salon / Spa','services,gallery,contact','Treatments,Space,Visit,Contact','Enquire about an appointment','BeautySalon'],
 ['ASTROLOGY','Astrology / Consultation','services,about,contact','Consultations,Approach,Questions,Contact','Enquire about a consultation','Service'],
 ['EVENT','Event / Wedding','services,projects,gallery,contact','Occasions,Work,Process,Contact','Discuss your occasion','Service'],
 ['BLOG','Blog / News','about,contact','Topics,Editorial,About,Contact','Contact the editor','Blog'],
 ['PERSONAL','Personal / Resume','projects,about,contact','Work,Skills,About,Contact','Get in touch','Person'],
 ['AGENCY','Digital Marketing / Agency','services,projects,about,contact','Capabilities,Work,Approach,Contact','Discuss your goals','Service'],
 ['SAAS','SaaS / Software','products,services,about,contact','Product,Use cases,Approach,Contact','Request product information','SoftwareApplication'],
 ['CUSTOM','Custom Website','about,contact','Overview,Details,About,Contact','Contact us','Organization'],
].map(([id,label,pages,sections,cta,schema]) => ({id,label,pages:['home',...pages.split(',')],sections:sections.split(','),cta,schemaSuggestion:schema}));
const STYLES=['Modern','Luxury','Minimal','Corporate','Creative','Bold','Traditional','Dark','Custom'];
const text = (v,max=1200) => { demand(v === undefined || typeof v === 'string' && v.length <= max && !hasSecret(v), 'Invalid or sensitive design field',400); return (v || '').trim(); };
function preferences(input={}) {
 demand(input && typeof input==='object' && !Array.isArray(input),'Invalid design preferences',400);
 const result={};
 for(const key of ['style','primary','accent','tone','typography','corners','animation','density','cta','sections','reference','instruction','assetsAvailability'])result[key]=text(input[key]);
 demand(!result.style || STYLES.includes(result.style),'Select a supported design style',400);
 for(const key of ['primary','accent'])demand(!result[key] || /^#[0-9a-f]{6}$/i.test(result[key]),'Colours must use #RRGGBB',400);
 for(const [key,values] of [['tone',['Light','Dark']],['corners',['Rounded','Sharp']],['animation',['None','Subtle','Moderate']],['density',['Compact','Balanced','Spacious']]])demand(!result[key] || values.includes(result[key]),`Invalid ${key}`,400);
 return result;
}
function websiteType(id) { const type=TYPES.find(t=>t.id===id); demand(type,'Select a supported website type',400); return type; }
function brief(req) { const type=websiteType(req.websiteType); return {source:'DETERMINISTIC / VERIFIED INPUTS',businessName:req.businessName,description:req.description,websiteType:type.label,pages:req.pages,sections:type.sections,cta:req.design?.cta || type.cta,schemaSuggestions:[type.schemaSuggestion],preferences:req.design,limitations:['Schema suggestions require verified facts; no payments, bookings, reviews or guarantees are invented.']}; }
function buttonInk(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2]>0.179?'#000000':'#ffffff';}
function variants(req, revision=1, instruction='') {
 const type=websiteType(req.websiteType), pref=preferences(req.design), note=text(instruction);
 // Refinements preserve the complete instruction for review. Supported visual
 // terms adjust actual tokens; unknown prose is explicitly left pending review.
 const blue=/blue|நீல/i.test(note), bigger=/hero.*big|bigger.*hero/i.test(note), simple=/mobile.*simple/i.test(note);
 return ['Editorial','Immersive','Conversion'].map((name,i)=>{
  const layout=['split','poster','stacked'][i], dark=pref.tone==='Dark' || (i===1 && pref.tone!=='Light');
  const sections=pref.sections ? pref.sections.split(',').map(s=>s.trim()).filter(Boolean).slice(0,8):type.sections;
  const spec={layout,nav:['inline','centered','compact'][i],heroScale:bigger?'large':['balanced','large','compact'][i],hierarchy:['editorial','display','direct'][i],cards:['outline','image-led','numbered'][i],footer:['columns','statement','compact'][i],mobile:simple?'simple':['stack','full-bleed','cta-first'][i],sections:i===2?[sections[0],...sections.slice(1).reverse()]:sections,primary:blue?'#174bc8':pref.primary || ['#155e54','#b88b51','#2558be'][(i+revision-1)%3],accent:pref.accent || '#e9bd73',background:dark?'#151b22':'#f7f5ef',ink:dark?'#f7f5ef':'#182832',typography:pref.typography || ['Editorial serif','Elegant serif','Modern sans'][i],corners:pref.corners || (i===1?'Sharp':'Rounded'),density:pref.density || ['Spacious','Balanced','Compact'][i],animation:pref.animation || 'None',cta:pref.cta || type.cta,style:pref.style || ['Modern','Luxury','Bold'][i]};
  spec.buttonInk=buttonInk(spec.primary);
  const id=`design-r${revision}-${i+1}`, reference=hash(JSON.stringify({spec,businessName:req.businessName,description:req.description}));
  return {id,name:`${name} · ${type.label}`,revision,spec,refinement:note,refinementStatus:note?'LIMITED TOKEN REFINEMENT; REVIEW INSTRUCTION. Unrecognized requests are not automatically implemented.':'Not requested',previews:{desktop:{id:`${id}-desktop`,width:1280,height:900,reference},mobile:{id:`${id}-mobile`,width:390,height:844,reference}},evidence:'DESIGN PREVIEW — deterministic layout representation, not a rendered-site screenshot'};
 });
}
function lock(req,variant) { return {selectedVariantId:variant.id,websiteType:req.websiteType,designStyle:variant.spec.style,layoutSpecification:structuredClone(variant.spec),colours:{primary:variant.spec.primary,accent:variant.spec.accent,background:variant.spec.background,ink:variant.spec.ink},typography:variant.spec.typography,sections:variant.spec.sections,cta:variant.spec.cta,desktopPreview:variant.previews.desktop,mobilePreview:variant.previews.mobile,revision:variant.revision,approvedAt:new Date().toISOString(),state:'APPROVED',fingerprint:hash(JSON.stringify(variant))}; }
module.exports={buttonInk,TYPES,STYLES,preferences,websiteType,brief,variants,lock};
