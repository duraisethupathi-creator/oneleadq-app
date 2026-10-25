const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const file='app/(tabs)/ai.tsx';
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const fixture={id:'stage16-fixture',name:'Fixture only',productsServices:['Fictional verified offering'],phone:'+910000000000',email:'fixture@example.test',services:['Web Development','Mobile App Development','Business Automation']};
let state, cursor, payload, requests=0;
const registry={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/agents/registry.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:registry});
let storedClientId=fixture.id;let forceFailure=false;
const react={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat()}),useState:initial=>{const n=cursor++;if(!(n in state))state[n]=initial;return[state[n],value=>state[n]=value]},useCallback:x=>x,useRef:v=>({current:v}),useEffect:()=>{}};
const rn=new Proxy({StyleSheet:{create:x=>x},Platform:{OS:'android'},Alert:{alert:()=>{}}},{get:(target,key)=>target[key]||key});
const exportsObject={};
vm.runInNewContext(code,{exports:exportsObject,Error,AbortController,require:name=>{if(name.endsWith('/localDate'))return {localDateKey:()=>new Date().toLocaleDateString('en-CA')};
 if(name==='react')return react;if(name==='react-native')return rn;if(name==='expo-router')return {useFocusEffect:()=>{}};
 if(name.endsWith('/aiAgent')||name.endsWith('/agencyDraft'))return {[name.endsWith('/agencyDraft')?'requestAgencyDraft':'askOneLeadQAgent']:async(message,context)=>{requests++;payload={message,context};if(forceFailure)throw Error("Gateway endpoint unavailable (HTTP 404).");if(message==='Create ads')return {ok:true,agent:'Choose a service',reply:'Which ads?',clarificationRequired:true,choices:['metaAds','googleAds']};return {ok:true,agent:'Website Agent',reply:'Fixture reply',handoff:{kind:'web-development',clientId:context.id,mode:'CREATE_NEW',intent:'create'}}},checkAIAgentHealth:async()=>({connected:true})};
 if(name.endsWith('/registry'))return registry;
 if(name.endsWith('/clientStorage'))return {loadCurrentClientId:async()=>storedClientId};
 if(name.endsWith('/theme'))return {colors:{}};return {};
}});
function render(values){state=values;cursor=0;return exportsObject.default()}
function nodes(tree){return tree&&typeof tree==='object'?[tree,...tree.children.flatMap(nodes)]:[]}
(async()=>{
 let tree=render([fixture,'fixture prompt','','','',null,false]);
 const button=nodes(tree).find(x=>x.type==='Pressable'&&x.props.onPress?.name==='askAI');assert.ok(button);await button.props.onPress();
 assert.equal(payload.context.id,fixture.id);assert.deepEqual(payload.context.services,fixture.services);assert.deepEqual(payload.context.productsServices,fixture.productsServices);assert.equal(payload.context.phone,fixture.phone);assert.equal(payload.context.email,fixture.email);assert.equal(state[7].clientId,fixture.id);
 const handoff=state[7];tree=render([fixture,'fixture prompt','Fixture reply','Website Agent','',true,false,handoff,false]);const openButton=nodes(tree).find(x=>x.props.accessibilityLabel==='Open Website Development workspace');assert.ok(openButton);openButton.props.onPress();assert.equal(state[8],true);tree=render(state);assert.ok(nodes(tree).some(x=>x.type==='Modal'&&x.props.visible===true));assert.ok(nodes(tree).some(x=>x.props.handoff?.clientId===fixture.id&&x.props.active===true));
 tree=render([{...fixture,id:'other-client'},'fixture prompt','Fixture reply','Website Agent','',true,false,handoff,false]);assert.ok(!nodes(tree).some(x=>x.props.accessibilityLabel==='Open Website Development workspace'));
 tree=render([fixture,'fixture prompt','Network error','','',false,false]);assert.ok(!nodes(tree).some(x=>x.props.onPress?.name==='addAIResponseToTasks'));
 tree=render([fixture,'fixture prompt','Fixture reply','Website Agent','',true,false]);assert.ok(nodes(tree).some(x=>x.props.onPress?.name==='addAIResponseToTasks'));
 assert.ok(nodes(tree).some(x=>x.props.accessibilityLabel==='AI prompt'));
 storedClientId='other-client';tree=render([fixture,'fixture prompt','','','',null,false]);await nodes(tree).find(x=>x.type==='Pressable'&&x.props.onPress?.name==='askAI').props.onPress();assert.match(state[2],/Selected client changed/);assert.equal(state[3],'');
 storedClientId=fixture.id;tree=render([fixture,'Create ads','','','',null,false]);await nodes(tree).find(x=>x.props.onPress?.name==='askAI').props.onPress();tree=render(state);const before=requests;const choice=nodes(tree).find(x=>x.props.accessibilityLabel==='Choose Meta Ads Management');assert.ok(choice);choice.props.onPress();assert.equal(state[1],'Create Meta Ads strategy');assert.equal(requests,before,'Choosing a service must not submit or spend');
 forceFailure=true;tree=render([fixture,'fixture prompt','','','',null,false]);await nodes(tree).find(x=>x.props.onPress?.name==='askAI').props.onPress();assert.equal(state[5],true,'Healthy backend remains Online after Generate failure');assert.match(state[2],/HTTP 404/);assert.equal(state[6],false);
 console.log('PASS: AI tab sends selected client ID/services, hides task action for failed requests and shows it for successful replies; accessible prompt');
})().catch(e=>{console.error(e);process.exitCode=1});
