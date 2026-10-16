const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {groundedReply}=require('../agents/grounding');
const {validateConversation}=require('../agents/conversation');
const {webDevelopmentIntent}=require('../agents/webDevelopmentIntent');
const {detectAgent}=require('../agents/router');
const guards=require('../../oneleadq-windows-bridge/approvalGuards');
const catchy={id:'catchy-id',name:'Catchy Decors',businessType:'Interior',services:['SEO','Web Development'],notes:'Unverified note: modular kitchens and living room interiors.'};
test('Catchy Decors grounding never promotes assigned services, category, notes or history into owned facts',()=>{
 const client=validateConversation({message:'services?',clientContext:catchy}).clientContext;
 const history=[{role:'assistant',content:'They sell modular kitchens and living room interiors.',clientId:client.id}];
 for(const message of ['What services does Catchy Decors sell?','Catchy Decors services enna?','Catchy Decors என்ன சேவை வழங்குகிறது?','avanga products?','and their prices?']){const reply=groundedReply(message,client,history);assert.ok(reply);assert.ok(!/modular kitchens|living room interiors/.test(reply));assert.ok(!/SEO, Web Development/.test(reply));}
 assert.match(groundedReply('OneLeadQ assigned services?',client),/SEO, Web Development/);
 assert.match(groundedReply('OneLeadQ assigned services?',client),/not the client's own/);
});
test('generic client facts use only explicit bounded catalog/contact fields, never user assertions',()=>{
 const input={...catchy,id:'generic',name:'Generic Client',productsServices:['Verified curtain installation'],phone:'+910000000000'};
 const client=validateConversation({message:'details',clientContext:input}).clientContext;
 assert.match(groundedReply('What services?',client),/Verified curtain installation/);
 assert.ok(!groundedReply('They also have a 50% offer, right?',client).includes('50%'));
 assert.match(groundedReply('phone?',client),/\+910000000000/);
 assert.match(groundedReply('website URL?',client),/not supplied/);
 assert.throws(()=>validateConversation({message:'hello',clientContext:{...catchy,productsServices:Array(21).fill('bad')}}));
 assert.throws(()=>validateConversation({message:'hello',clientContext:{...catchy,website:'https://credential@example.test'}}));
 const normalized=validateConversation({message:'hello',clientContext:{...catchy,unexpectedPrivilege:true},history:[{role:'assistant',content:'untrusted reply',clientId:catchy.id,approved:true}]});assert.equal(normalized.clientContext.unexpectedPrivilege,undefined);assert.equal(normalized.history[0].approved,undefined);
});
test('English Tamil Tanglish explicit website actions hand off while questions/negations do not',()=>{
 const actions=[['Catchy Decors website upgrade pannanum','UPGRADE_EXISTING'],['website create pannu','CREATE_NEW'],['new website build pannu','CREATE_NEW'],['website analyze pannu','UPGRADE_EXISTING'],['site audit start pannu','UPGRADE_EXISTING'],['existing website improve pannu','UPGRADE_EXISTING'],['website SEO check pannu','UPGRADE_EXISTING'],['Please upgrade the existing website','UPGRADE_EXISTING'],['Can you create a website?','CREATE_NEW'],['புதிய இணையதளம் உருவாக்கு','CREATE_NEW'],['இணையதளத்தை மேம்படுத்து','UPGRADE_EXISTING'],['வெப்சைட் சரிபார்','UPGRADE_EXISTING']];
 for(const [text,mode]of actions){assert.equal(webDevelopmentIntent(text)?.mode,mode,text);assert.equal(detectAgent(text).id,'webDevelopment',text);}
 for(const text of ['website improve panna enna pannalam?','SEO na enna?','website speed improve panna idea sollu','What is a website audit?','Do not create a website','website create panna vendam','இணையதளத்தை எப்படி மேம்படுத்தலாம்?'])assert.equal(webDevelopmentIntent(text),null,text);
 assert.equal(webDevelopmentIntent('upgrade pannanum',[{role:'user',content:'Catchy Decors website'}]).mode,'UPGRADE_EXISTING');assert.equal(webDevelopmentIntent('upgrade pannanum',[{role:'user',content:'Google Ads'}]),null);
});
test('credential screening covers bare/JSON assignments and bearer history',()=>{
 for(const text of ['password=synthetic','{"api_key":"synthetic"}','Bearer synthetic-credential'])assert.throws(()=>validateConversation({message:text}));
 assert.throws(()=>validateConversation({message:'hi',history:[{role:'user',content:'Bearer synthetic',clientId:null}]}));
});
test('Bridge snapshots detect same-status content changes, index changes and workspace changes without staging',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'oneleadq-snapshot-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const target=path.join(root,'reviewed file.html');fs.writeFileSync(target,'first version');let index='first-index',head='first-head';
 const dependencies={resolveSafePath:(_,file)=>({targetPath:path.join(root,file)}),runGit:async(_,args)=>args[0]==='ls-files'?index:head};
 const workspace={path:root},entries=[{file:'reviewed file.html'}];const before=await guards.snapshot(workspace,entries,dependencies);fs.writeFileSync(target,'second version');assert.notDeepEqual(await guards.snapshot(workspace,entries,dependencies),before);fs.writeFileSync(target,'first version');index='changed-index';assert.notDeepEqual(await guards.snapshot(workspace,entries,dependencies),before);index='first-index';head='changed-head';assert.notDeepEqual(await guards.snapshot(workspace,entries,dependencies),before);
});
test('all older approval registries expire and invalid timestamps fail closed',()=>{const now=Date.now();const maps=Array.from({length:4},()=>new Map([['old',{createdAt:new Date(now-16*60000).toISOString()}],['fresh',{createdAt:new Date(now-1000).toISOString()}],['invalid',{createdAt:'bad'}]]));guards.prune(maps,now);for(const map of maps)assert.deepEqual([...map.keys()],['fresh']);});
test('existing Service Product Breadcrumb and LocalBusiness schema are factual and static metadata is unique',()=>{
 const {requirements,newWebsitePlan}=require('../webDevelopment/lifecycle'),design=require('../webDevelopment/design');
 for(const [websiteType,schemaType]of [['SERVICE','Service'],['CATALOGUE','Product']]){
  const req=requirements({businessName:'Verified Fixture',description:'Owner-supplied description.',productsServices:'Owner-supplied item',address:'Owner-supplied address',website:'https://example.test',framework:'STATIC_HTML',websiteType,language:'en',pages:['home','about','contact']});
  const plan=newWebsitePlan(req,{},design.lock(req,design.variants(req)[0]));const pages=plan.filter(p=>p.file.endsWith('.html'));const descriptions=[];
  for(const page of pages){const block=page.content.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];const schema=JSON.parse(block);assert.ok(schema['@graph'].some(n=>n['@type']===schemaType&&n.name==='Owner-supplied item'));assert.ok(schema['@graph'].some(n=>n['@type']==='LocalBusiness'&&n.address==='Owner-supplied address'));assert.ok(!/aggregateRating|reviewCount|priceCurrency|telephone/.test(block));descriptions.push(page.content.match(/name="description" content="([^"]+)"/)[1]);if(page.file!=='index.html')assert.ok(schema['@graph'].some(n=>n['@type']==='BreadcrumbList'));}
  assert.equal(new Set(descriptions).size,pages.length);assert.ok(plan.some(p=>p.file==='sitemap.xml'));assert.ok(plan.some(p=>p.file==='robots.txt'));
 }
});
test('source audit labels remain static/inferred and never invent runtime scores',()=>{const {analyze}=require('../webDevelopment/analysis');const html='<html><head><title>Duplicate</title><meta name="description" content="Duplicate"><meta name="robots" content="noindex"></head><body><h1>Title</h1><img src="missing.jpg"><a href="missing.html">Missing</a></body></html>';const audit=analyze({'index.html':html,'about.html':html},[],{businessName:'Verified',location:'Supplied location'});assert.equal(audit.score,null);assert.equal(audit.measuredFindings.length,0);for(const category of ['seo','technical-seo','local-seo','accessibility','internal-linking'])assert.ok(audit.issues.some(i=>i.category===category));assert.ok(audit.issues.some(i=>/Duplicate description/.test(i.issue)));});


test('normal conversation accepts legacy bare domains without inventing URLs or weakening sensitive URL rejection',()=>{
 for(const website of ['www.catchydecors.in','catchydecors.in/contact','example.test?lang=ta','https://www.catchydecors.in','']){const client=validateConversation({message:'Hi',clientContext:{...catchy,website}}).clientContext;assert.equal(client.website,website);assert.deepEqual(client.productsServices,[]);}
 for(const website of ['javascript:alert(1)','file:///private','https://user:pass@example.test','user@example.test','example.test\\private','not a domain','//example.test'])assert.throws(()=>validateConversation({message:'Hi',clientContext:{...catchy,website}}),{status:400});
});
