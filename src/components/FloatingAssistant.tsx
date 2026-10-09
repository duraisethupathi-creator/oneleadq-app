import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { askOneLeadQAgent } from '../services/aiAgent';
import {
  loadClients,
  loadCurrentClientId,
} from '../storage/clientStorage';

import { Client } from '../types/client';
type Mood='idle'|'happy'|'thinking'|'idea'|'alert'|'success';
type AssistantState='idle'|'walking'|'listening'|'thinking'|'talking';

const moodUI:Record<Mood,{face:string,label:string,accent:string}>={
 idle:{face:'­ƒÿè',label:'Ready',accent:'#0B5D4B'},
 happy:{face:'­ƒÿä',label:'Hello!',accent:'#0B5D4B'},
 thinking:{face:'­ƒñö',label:'ThinkingÔÇª',accent:'#C28A2C'},
 idea:{face:'­ƒÆí',label:'I have an idea',accent:'#C28A2C'},
 alert:{face:'­ƒÿ«',label:'Needs attention',accent:'#C84B45'},
 success:{face:'­ƒÑ│',label:'Done!',accent:'#0B8A68'},
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

function AssistantMascot({state='idle',facingLeft=false}:{state?:AssistantState;facingLeft?:boolean}){
 const [frame,setFrame]=useState(0);
 const isWalking=state==='walking';
 useEffect(()=>{
  setFrame(0);
  if(!isWalking)return;
  const timer=setInterval(()=>setFrame(v=>(v+1)%walkFrames.length),160);
  return()=>clearInterval(timer);
 },[isWalking]);
 const source=isWalking?walkFrames[frame]:walkFrames[0];
 return <View style={s.mascotViewport}><Image source={source} style={[s.mascot,{transform:[{scaleX:facingLeft?-1:1}]}]} resizeMode="contain"/></View>;
}

export type FloatingAssistantHandle={handleScreenTouch:()=>void};

const FloatingAssistant=forwardRef<FloatingAssistantHandle>(function FloatingAssistant(_,ref){
 const [open,setOpen]=useState(false);
 const [mood,setMood]=useState<Mood>('happy');
 const [assistantState,setAssistantState]=useState<AssistantState>('walking');
 const [facingLeft,setFacingLeft]=useState(true);
 const [message,setMessage]=useState("Hi! I'm your OneLeadQ AI Assistant. How can I help you today?");
 const [input,setInput]=useState('');
 const [currentClient, setCurrentClient] = useState<Client | null>(null);
 useEffect(() => {
  let active = true;

  const loadCurrentClient = async () => {
    try {
      const currentClientId = await loadCurrentClientId();

      if (!currentClientId) {
        if (active) setCurrentClient(null);
        return;
      }

      const clients = await loadClients();

      const client =
        clients.find(
          item =>
            item.id === currentClientId &&
            item.status === 'active'
        ) ?? null;

      if (active) {
        setCurrentClient(client);
      }
    } catch (error) {
      console.error(
        'Floating Assistant client load error:',
        error
      );

      if (active) {
        setCurrentClient(null);
      }
    }
  };

  loadCurrentClient();

  return () => {
    active = false;
  };
}, []);
 const walkX=useRef(new Animated.Value(0)).current;
 const walkAnimation=useRef<Animated.CompositeAnimation|null>(null);
 const screenWidth=Dimensions.get('window').width;
 const travel=Math.max(0,screenWidth-124);

 const stopWalking=()=>{
  walkAnimation.current?.stop();
  walkAnimation.current=null;
  walkX.stopAnimation();
  setAssistantState('idle');
 };

 const startWalking=()=>{
  if(open)return;
  walkAnimation.current?.stop();
  setAssistantState('walking');

  const walkLeft=()=>{
   setFacingLeft(true);
   const animation=Animated.timing(walkX,{toValue:-travel,duration:6500,useNativeDriver:true});
   walkAnimation.current=animation;
   animation.start(({finished})=>{if(finished)walkRight();});
  };

  const walkRight=()=>{
   setFacingLeft(false);
   const animation=Animated.timing(walkX,{toValue:0,duration:6500,useNativeDriver:true});
   walkAnimation.current=animation;
   animation.start(({finished})=>{if(finished)walkLeft();});
  };

  walkX.stopAnimation((value)=>{
   if(value<=-travel+2)walkRight();
   else walkLeft();
  });
 };

 useEffect(()=>{
  const timer=setTimeout(startWalking,500);
  return()=>{clearTimeout(timer);walkAnimation.current?.stop();};
 },[]);

 const pan=useMemo(()=>PanResponder.create({
  onStartShouldSetPanResponder:()=>false,
  onMoveShouldSetPanResponder:()=>false,
 }),[]);

 function toggleAssistant(){
  if(open){
   setOpen(false);
   setMood('happy');
  }else{
   stopWalking();
   setOpen(true);
   setMood('happy');
   setMessage("Hi! I'm your OneLeadQ AI Assistant. How can I help you today?");
  }
 }

 useEffect(()=>{
  if(open){
   walkAnimation.current?.stop();
   walkAnimation.current=null;
   return;
  }
  const timer=setTimeout(startWalking,180);
  return()=>clearTimeout(timer);
 },[open]);

 function quick(text:string,next:Mood){
  setAssistantState('thinking');
  setMood('thinking');
  setMessage('CheckingÔÇª');
  setTimeout(()=>{
   setMood(next);
   setAssistantState('talking');
   setMessage(text);
   setTimeout(()=>setAssistantState('idle'),900);
  },650);
 }

 async function send() {
  const q = input.trim();

  if (!q) return;

  setInput('');
  setAssistantState('thinking');
  setMood('thinking');
  setMessage('OneLeadQ AI is thinking...');

  try {
    const result = await askOneLeadQAgent(q);

    if (!result.reply) {
      throw new Error('No AI response');
    }

    setMessage(result.reply);
    setMood('success');
    setAssistantState('talking');

    setTimeout(() => {
      setAssistantState('idle');
    }, 1200);
  } catch (error) {
    setAssistantState('idle');
    setMood('alert');

    setMessage(
      error instanceof Error
        ? error.message
        : 'Unable to connect to OneLeadQ AI.'
    );
  }
}

 useImperativeHandle(ref,()=>({
  handleScreenTouch(){
   if(open)return;
   stopWalking();
   setMood('happy');
   setMessage("What can I help you with?");
  }
 }));

 const ui=moodUI[mood];

  return (
  <View pointerEvents="box-none" style={s.layer}>

   {open && (
    <View pointerEvents="box-none" style={s.panelLayer}>
     <View style={s.panel}>
      <View style={s.head}>
       <View>
        <Text style={s.title}>OneLeadQ Assistant</Text>
        <Text style={[s.state,{color:ui.accent}]}>
         {ui.label}
        </Text>
       </View>

       <Pressable
        accessibilityLabel="Close assistant"
        onPress={toggleAssistant}
        style={s.close}
       >
        <Ionicons name="close" size={20}/>
       </Pressable>
      </View>

      <View style={s.reply}>
       <View style={s.replyMascot}>
        <AssistantMascot state={assistantState}/>
       </View>

       <Text style={s.replyText}>
        {message}
       </Text>
      </View>

      <View style={s.actions}>
       <Pressable
        style={s.chip}
        onPress={() =>
         quick(
          'I can review the current campaign and flag low-performance areas.',
          'idea'
         )
        }
       >
        <Text style={s.chipText}>Ads idea</Text>
       </Pressable>

       <Pressable
        style={s.chip}
        onPress={() =>
         quick(
          'SEO check is ready. I can surface title, keyword and local SEO issues.',
          'success'
         )
        }
       >
        <Text style={s.chipText}>SEO check</Text>
       </Pressable>

       <Pressable
        style={s.chip}
        onPress={() =>
         quick(
          'Content assistant is ready for captions, reels and post ideas.',
          'happy'
         )
        }
       >
        <Text style={s.chipText}>Content</Text>
       </Pressable>
      </View>

      <View style={s.inputRow}>
       <TextInput
        value={input}
        onChangeText={setInput}
        onSubmitEditing={send}
        placeholder="Ask me anything..."
        style={s.input}
       />

       <Pressable
        onPress={send}
        style={s.send}
       >
        <Ionicons
         name="arrow-up"
         size={20}
         color="white"
        />
       </Pressable>
      </View>
     </View>
    </View>
   )}

   <Animated.View
    pointerEvents="box-none"
    style={[
     s.wrap,
     {
      transform:[
       {translateX:open ? 0 : walkX}
      ]
     }
    ]}
   >
    <View {...pan.panHandlers}>
     <Pressable
      accessibilityLabel="Open OneLeadQ assistant"
      onPress={toggleAssistant}
      style={s.bot}
     >
      <AssistantMascot
       state={assistantState}
       facingLeft={facingLeft}
      />
     </Pressable>
    </View>
   </Animated.View>

  </View>
 );
});

export default FloatingAssistant;

const s=StyleSheet.create({
    layer:{
 position:'absolute',
 top:0,
 right:0,
 bottom:0,
 left:0,
 zIndex:999,
 elevation:30,
 pointerEvents:'box-none',
},

panelLayer:{
 position:'absolute',
 left:12,
 right:12,
 bottom:212,
 alignItems:'center',
},
 wrap:{position:'absolute',right:12,bottom:82,zIndex:999,elevation:30,alignItems:'flex-end'},
 bot:{width:100,height:122,alignItems:'center',justifyContent:'flex-end',shadowColor:'#000',shadowOpacity:.16,shadowRadius:8,shadowOffset:{width:0,height:4}},
 mascotViewport:{width:'100%',height:'100%',overflow:'hidden',alignItems:'center',justifyContent:'flex-end'},
 mascot:{width:'100%',height:'100%'},
 dot:{position:'absolute',right:5,top:5,width:13,height:13,borderRadius:7,borderWidth:2,borderColor:'white'},
panel:{
 width:'100%',
 maxWidth:360,
 backgroundColor:'#FFFDF8',
 borderRadius:22,
 padding:14,
 borderWidth:1,
 borderColor:'#E5D8A8',
 shadowColor:'#000',
 shadowOpacity:.18,
 shadowRadius:12,
 shadowOffset:{width:0,height:5},
 elevation:24,
}, head:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
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
