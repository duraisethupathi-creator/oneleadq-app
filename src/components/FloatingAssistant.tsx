import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type Mood='idle'|'happy'|'thinking'|'idea'|'alert'|'success';
type AssistantState='idle'|'walking'|'listening'|'thinking'|'talking';

const moodUI:Record<Mood,{face:string,label:string,accent:string}>={
 idle:{face:'😊',label:'Ready',accent:'#0B5D4B'},
 happy:{face:'😄',label:'Hello!',accent:'#0B5D4B'},
 thinking:{face:'🤔',label:'Thinking…',accent:'#C28A2C'},
 idea:{face:'💡',label:'I have an idea',accent:'#C28A2C'},
 alert:{face:'😮',label:'Needs attention',accent:'#C84B45'},
 success:{face:'🥳',label:'Done!',accent:'#0B8A68'},
};

const walkFrames=[
 require('../../asset/assistant/walk/walk_01.png'),
 require('../../asset/assistant/walk/walk_02.png'),
 require('../../asset/assistant/walk/walk_03.png'),
 require('../../asset/assistant/walk/walk_04.png'),
 require('../../asset/assistant/walk/walk_05.png'),
 require('../../asset/assistant/walk/walk_06.png'),
 require('../../asset/assistant/walk/walk_07.png'),
 require('../../asset/assistant/walk/walk_08.png'),
];

function AssistantMascot({state='idle'}:{state?:AssistantState}){
 const [frame,setFrame]=useState(0);
 const isWalking=state==='walking';
 useEffect(()=>{
  setFrame(0);
  if(!isWalking)return;
  const timer=setInterval(()=>setFrame(v=>(v+1)%walkFrames.length),160);
  return()=>clearInterval(timer);
 },[isWalking]);
 // Until dedicated state assets arrive, non-walking states use one locked frame.
 const source=isWalking?walkFrames[frame]:walkFrames[0];
 return <View style={s.mascotViewport}><Image source={source} style={s.mascot} resizeMode="contain"/></View>;
}

export default function FloatingAssistant(){
 const [open,setOpen]=useState(false);
 const [mood,setMood]=useState<Mood>('happy');
 const [assistantState,setAssistantState]=useState<AssistantState>('idle');
 const [message,setMessage]=useState("Hi! I'm your OneLeadQ AI Assistant. How can I help you today?");
 const [input,setInput]=useState('');
 const pos=useRef(new Animated.ValueXY({x:0,y:0})).current;
 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>true,
  onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>4||Math.abs(g.dy)>4,
  onPanResponderGrant:()=>{pos.setOffset({x:(pos.x as any)._value,y:(pos.y as any)._value});pos.setValue({x:0,y:0});},
  onPanResponderMove:Animated.event([null,{dx:pos.x,dy:pos.y}],{useNativeDriver:false}),
  onPanResponderRelease:()=>{
   pos.flattenOffset();
   const {width,height}=Dimensions.get('window');
   const x=Math.max(-width+112,Math.min(0,(pos.x as any)._value));
   const y=Math.max(-height+210,Math.min(0,(pos.y as any)._value));
   Animated.spring(pos,{toValue:{x,y},useNativeDriver:false}).start();
  }
 }),[pos]);
 function quick(text:string,next:Mood){setAssistantState('thinking');setMood('thinking');setMessage('Checking…');setTimeout(()=>{setMood(next);setAssistantState('talking');setMessage(text);setTimeout(()=>setAssistantState('idle'),900)},650)}
 function send(){const q=input.trim();if(!q)return;setAssistantState('listening');setInput('');setTimeout(()=>quick(`I heard: “${q}”. Live AI answers will connect in the final AI integration stage.`,'idea'),220)}
 const ui=moodUI[mood];
 return <Animated.View pointerEvents="box-none" style={[s.wrap,{transform:pos.getTranslateTransform()}]}>
  {open&&<View style={s.panel}>
   <View style={s.head}><View><Text style={s.title}>OneLeadQ Assistant</Text><Text style={[s.state,{color:ui.accent}]}>{ui.label}</Text></View><Pressable accessibilityLabel="Close assistant" onPress={()=>setOpen(false)} style={s.close}><Ionicons name="close" size={20}/></Pressable></View>
   <View style={s.reply}><View style={s.replyMascot}><AssistantMascot state={assistantState}/></View><Text style={s.replyText}>{message}</Text></View>
   <View style={s.actions}>
    <Pressable style={s.chip} onPress={()=>quick('I can review the current campaign and flag low-performance areas.','idea')}><Text style={s.chipText}>Ads idea</Text></Pressable>
    <Pressable style={s.chip} onPress={()=>quick('SEO check is ready. I can surface title, keyword and local SEO issues.','success')}><Text style={s.chipText}>SEO check</Text></Pressable>
    <Pressable style={s.chip} onPress={()=>quick('Content assistant is ready for captions, reels and post ideas.','happy')}><Text style={s.chipText}>Content</Text></Pressable>
   </View>
   <View style={s.inputRow}><TextInput value={input} onChangeText={setInput} onSubmitEditing={send} placeholder="Ask me anything…" style={s.input}/><Pressable onPress={send} style={s.send}><Ionicons name="arrow-up" size={20} color="white"/></Pressable></View>
  </View>}
  <View {...pan.panHandlers}>
   <Pressable accessibilityLabel="Open OneLeadQ assistant" onPress={()=>setOpen(v=>!v)} style={s.bot}>
    <AssistantMascot state={assistantState}/>
    <View style={[s.dot,{backgroundColor:ui.accent}]}/>
   </Pressable>
  </View>
 </Animated.View>
}

const s=StyleSheet.create({
 wrap:{position:'absolute',right:12,bottom:82,zIndex:999,elevation:30,alignItems:'flex-end'},
 bot:{width:100,height:122,alignItems:'center',justifyContent:'flex-end',shadowColor:'#000',shadowOpacity:.16,shadowRadius:8,shadowOffset:{width:0,height:4}},
 mascotViewport:{width:'100%',height:'100%',overflow:'hidden',alignItems:'center',justifyContent:'flex-end'},
 mascot:{width:'100%',height:'100%'},
 dot:{position:'absolute',right:5,top:5,width:13,height:13,borderRadius:7,borderWidth:2,borderColor:'white'},
 panel:{width:310,maxWidth:'90%',backgroundColor:'#FFFDF8',borderRadius:22,padding:14,marginBottom:8,borderWidth:1,borderColor:'#E5D8A8',shadowColor:'#000',shadowOpacity:.18,shadowRadius:12,shadowOffset:{width:0,height:5}},
 head:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 title:{fontSize:16,fontWeight:'900',color:'#0B5D4B'},
 state:{fontSize:11,fontWeight:'800',marginTop:2},
 close:{width:38,height:38,borderRadius:19,backgroundColor:'#F0EDE4',alignItems:'center',justifyContent:'center'},
 reply:{flexDirection:'row',gap:10,alignItems:'center',backgroundColor:'white',padding:10,borderRadius:16,marginTop:10},
 replyMascot:{width:52,height:70},
 replyText:{flex:1,color:'#26312E',lineHeight:19},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},
 chip:{borderWidth:1,borderColor:'#D8CFB2',borderRadius:16,paddingHorizontal:11,paddingVertical:8},
 chipText:{fontSize:12,fontWeight:'800',color:'#0B5D4B'},
 inputRow:{flexDirection:'row',gap:8,marginTop:10},
 input:{flex:1,minHeight:44,borderWidth:1,borderColor:'#D8CFB2',borderRadius:14,paddingHorizontal:12,backgroundColor:'white'},
 send:{width:44,height:44,borderRadius:14,backgroundColor:'#0B5D4B',alignItems:'center',justifyContent:'center'}
});