const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const file='app/(tabs)/ai.tsx';
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const fixture={id:'stage16-fixture',name:'Fixture only',services:['Web Development','Mobile App Development','Business Automation']};
let state, cursor, payload;
const react={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat()}),useState:initial=>{const n=cursor++;if(!(n in state))state[n]=initial;return[state[n],value=>state[n]=value]},useCallback:x=>x};
const rn=new Proxy({StyleSheet:{create:x=>x},Platform:{OS:'android'},Alert:{alert:()=>{}}},{get:(target,key)=>target[key]||key});
const exportsObject={};
vm.runInNewContext(code,{exports:exportsObject,require:name=>{
 if(name==='react')return react;if(name==='react-native')return rn;if(name==='expo-router')return {useFocusEffect:()=>{}};
 if(name.endsWith('/aiAgent'))return {askOneLeadQAgent:async(message,context)=>{payload={message,context};return {ok:true,agent:'Website Agent',reply:'Fixture reply'}},checkAIAgentHealth:async()=>({connected:true})};
 if(name.endsWith('/theme'))return {colors:{}};return {};
}});
function render(values){state=values;cursor=0;return exportsObject.default()}
function nodes(tree){return tree&&typeof tree==='object'?[tree,...tree.children.flatMap(nodes)]:[]}
(async()=>{
 let tree=render([fixture,'fixture prompt','','','',null,false]);
 const button=nodes(tree).find(x=>x.type==='Pressable'&&x.props.onPress?.name==='askAI');assert.ok(button);await button.props.onPress();
 assert.equal(payload.context.id,fixture.id);assert.deepEqual(payload.context.services,fixture.services);
 tree=render([fixture,'fixture prompt','Network error','','',false,false]);assert.ok(!nodes(tree).some(x=>x.props.onPress?.name==='addAIResponseToTasks'));
 tree=render([fixture,'fixture prompt','Fixture reply','Website Agent','',true,false]);assert.ok(nodes(tree).some(x=>x.props.onPress?.name==='addAIResponseToTasks'));
 assert.ok(nodes(tree).some(x=>x.props.accessibilityLabel==='AI prompt'));
 console.log('PASS: AI tab sends selected client ID/services, hides task action for failed requests and shows it for successful replies; accessible prompt');
})().catch(e=>{console.error(e);process.exitCode=1});
