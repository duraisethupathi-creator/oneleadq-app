import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Image, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
 const [textMode,setTextMode]=useState(false);
 const walkX=useRef(new Animated.Value(0)).current;
 const walkAnimation=useRef<Animated.CompositeAnimation|null>(null);
 const screenWidth=Dimensions.get('window').width;
 const travel=Math.max(0,screenWidth-124);
 const panelWidth=Math.min(310,screenWidth-24);
 const heardSpeech=useRef(false);
 const retryCount=useRef(0);
 const listenTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

 function clearListenTimer(){
  if(listenTimer.current){clearTimeout(listenTimer.current);listenTimer.current=null;}
 }

 useSpeechRecognitionEvent('start',()=>{
  heardSpeech.current=false;
  setAssistantState('listening');
  setMessage('🎤 கேட்கிறேன்… பேசுங்க');
 });
 useSpeechRecognitionEvent('result',(event)=>{
  const text=event.results?.[0]?.transcript?.trim();
  if(text){
   heardSpeech.current=true;
   retryCount.current=0;
   setInput(text);
   setMessage(text);
  }
 });
 useSpeechRecognitionEvent('end',()=>{
  clearListenTimer();
  setAssistantState('idle');
 });
 useSpeechRecognitionEvent('error',(event)=>{
  clearListenTimer();
  setAssistantState('idle');
  if(event.error==='no-speech'){
   setMessage('குரல் கேட்கவில்லை. 🎤 மீண்டும் பேச Mic-ஐ அழுத்துங்க.');
   return;
  }
  setMessage('Voice listening issue. Mic-ஐ அழுத்தி மீண்டும் முயற்சி செய்யுங்க.');
 });

 async function startListening(){
  try{
   const permission=await ExpoSpeechRecognitionModule.requestPermissionsAsync();
   if(!permission.granted){
    setAssistantState('idle');
    setMessage('Microphone permission தேவை.');
    return;
   }
   clearListenTimer();
   heardSpeech.current=false;
   setAssistantState('listening');
   setMessage('🎤 கேட்கிறேன்… பேசுங்க');
   ExpoSpeechRecognitionModule.start({
    lang:'ta-IN',
    interimResults:true,
    continuous:false,
    maxAlternatives:1,
   });
   listenTimer.current=setTimeout(()=>{
    if(!heardSpeech.current){
     try{ExpoSpeechRecognitionModule.stop();}catch{}
    }
   },10000);
  }catch{
   setAssistantState('idle');
   setMessage('Voice listening start ஆகவில்லை.');
  }
 }

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

 async function speakVoicePrompt(){
  await Speech.stop();
  setAssistantState('talking');
  setMessage('என்ன செய்யணும்? சொல்லுங்க');

  try{
   const voices=await Speech.getAvailableVoicesAsync();
   const tamilVoice=voices.find(v=>v.language?.toLowerCase()==='ta-in')
    ?? voices.find(v=>v.language?.toLowerCase().startsWith('ta'));

   const options:Speech.SpeechOptions={
    language:tamilVoice?.language ?? 'ta-IN',
    rate:0.85,
    pitch:1.0,
    onStart:()=>setAssistantState('talking'),
    onDone:()=>{
     setAssistantState('idle');
     setMessage('ஒரு நிமிஷம்… Mic ready ஆகுது');
     setTimeout(()=>{void startListening();},650);
    },
    onStopped:()=>setAssistantState('idle'),
    onError:()=>setAssistantState('idle'),
   };

   if(tamilVoice?.identifier)options.voice=tamilVoice.identifier;
   Speech.speak('என்ன செய்யணும்? சொல்லுங்க',options);
  }catch{
   Speech.speak('What should I do? Tell me',{
    language:'en-IN',
    rate:0.9,
    onDone:()=>setAssistantState('idle'),
    onError:()=>setAssistantState('idle'),
   });
  }
 }

 function toggleAssistant(){
  if(open){
   Speech.stop();
   clearListenTimer();
   try{ExpoSpeechRecognitionModule.abort();}catch{}
   setOpen(false);
   setTextMode(false);
   setMood('happy');
  }else{
   stopWalking();
   setOpen(true);
   setTextMode(false);
   setMood('happy');
   setMessage('என்ன செய்யணும்? சொல்லுங்க');
   setTimeout(()=>{void speakVoicePrompt();},350);
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
  setMessage('Checking…');
  setTimeout(()=>{
   setMood(next);
   setAssistantState('talking');
   setMessage(text);
   setTimeout(()=>setAssistantState('idle'),900);
  },650);
 }

 function send(){
  const q=input.trim();
  if(!q)return;
  setAssistantState('listening');
  setInput('');
  setTimeout(()=>quick(`I heard: “${q}”. Live AI answers will connect in the final AI integration stage.`,'idea'),220);
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

 return <View pointerEvents="box-none" style={s.layer}>
  {open&&<KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={12} style={s.keyboardLayer} pointerEvents="box-none"><View style={[s.panel,{width:panelWidth}]}>
   <View style={s.head}><View><Text style={s.title}>OneLeadQ Assistant</Text><Text style={[s.state,{color:ui.accent}]}>{ui.label}</Text></View><Pressable accessibilityLabel="Close assistant" onPress={toggleAssistant} style={s.close}><Ionicons name="close" size={20}/></Pressable></View>
   <View style={s.reply}><View style={s.replyMascot}><AssistantMascot state={assistantState}/></View><Text style={s.replyText}>{message}</Text></View>
   {!textMode?<View style={s.voiceBox}>
    <Pressable accessibilityLabel="Start voice listening" onPress={()=>{void startListening();}} style={[s.bigMic,assistantState==='listening'&&s.bigMicListening]}><Ionicons name={assistantState==='listening'?'mic':'mic-outline'} size={34} color="white"/></Pressable>
    <Text style={s.voiceTitle}>{assistantState==='listening'?'Listening…':'Voice Chat'}</Text>
    <Text style={s.voiceHint}>{assistantState==='listening'?'பேசுங்க… உங்கள் குரலை கேட்கிறேன்':'Mic-ஐ அழுத்தி பேசலாம்'}</Text>
    <Pressable accessibilityLabel="Switch to text chat" onPress={()=>{clearListenTimer();try{ExpoSpeechRecognitionModule.abort();}catch{}setAssistantState('idle');setTextMode(true);}} style={s.keyboardButton}><Ionicons name="keypad-outline" size={20} color="#0B5D4B"/><Text style={s.keyboardText}>Text Chat</Text></Pressable>
   </View>:<View style={s.textBox}>
    <View style={s.textModeHead}><Text style={s.textModeTitle}>Text Chat</Text><Pressable accessibilityLabel="Switch to voice chat" onPress={()=>{setTextMode(false);void startListening();}} style={s.voiceSwitch}><Ionicons name="mic-outline" size={20} color="#0B5D4B"/><Text style={s.keyboardText}>Voice</Text></Pressable></View>
    <View style={s.inputRow}><TextInput autoFocus value={input} onChangeText={setInput} onSubmitEditing={send} placeholder="Type your message…" style={s.input}/><Pressable onPress={send} style={s.send}><Ionicons name="arrow-up" size={20} color="white"/></Pressable></View>
   </View>}
   </View></KeyboardAvoidingView>}
  <Animated.View pointerEvents="box-none" style={[s.walker,{transform:[{translateX:open?0:walkX}]}]}>
   <View {...pan.panHandlers}>
    <Pressable accessibilityLabel="Open OneLeadQ assistant" onPress={toggleAssistant} style={s.bot}>
     <AssistantMascot state={assistantState} facingLeft={facingLeft}/>
    </Pressable>
   </View>
  </Animated.View>
 </View>
});

export default FloatingAssistant;

const s=StyleSheet.create({
 layer:{position:'absolute',top:0,right:0,bottom:0,left:0,zIndex:999,elevation:30,pointerEvents:'box-none'},
 walker:{position:'absolute',right:12,bottom:82,alignItems:'flex-end'},
 bot:{width:100,height:122,alignItems:'center',justifyContent:'flex-end',shadowColor:'#000',shadowOpacity:.16,shadowRadius:8,shadowOffset:{width:0,height:4}},
 mascotViewport:{width:'100%',height:'100%',overflow:'hidden',alignItems:'center',justifyContent:'flex-end'},
 mascot:{width:'100%',height:'100%'},
 keyboardLayer:{position:'absolute',top:0,right:0,bottom:0,left:0,justifyContent:'flex-end',alignItems:'flex-end',paddingRight:12,paddingBottom:212},
 panel:{backgroundColor:'#FFFDF8',borderRadius:22,padding:14,borderWidth:1,borderColor:'#E5D8A8',shadowColor:'#000',shadowOpacity:.18,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:24},
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
 voiceBox:{alignItems:'center',marginTop:12,paddingVertical:12},
 bigMic:{width:72,height:72,borderRadius:36,backgroundColor:'#0B5D4B',alignItems:'center',justifyContent:'center'},
 bigMicListening:{transform:[{scale:1.08}]},
 voiceTitle:{fontSize:16,fontWeight:'900',color:'#0B5D4B',marginTop:9},
 voiceHint:{fontSize:12,fontWeight:'700',color:'#5F6E69',marginTop:4,textAlign:'center'},
 keyboardButton:{marginTop:12,flexDirection:'row',alignItems:'center',gap:6,borderWidth:1,borderColor:'#D8CFB2',borderRadius:16,paddingHorizontal:13,paddingVertical:8,backgroundColor:'white'},
 keyboardText:{fontSize:12,fontWeight:'800',color:'#0B5D4B'},
 textBox:{marginTop:10},
 textModeHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 textModeTitle:{fontSize:14,fontWeight:'900',color:'#0B5D4B'},
 voiceSwitch:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:'#D8CFB2',borderRadius:14,paddingHorizontal:10,paddingVertical:7,backgroundColor:'white'},
 inputRow:{flexDirection:'row',gap:8,marginTop:10},
 input:{flex:1,minHeight:44,borderWidth:1,borderColor:'#D8CFB2',borderRadius:14,paddingHorizontal:12,backgroundColor:'white'},
 send:{width:44,height:44,borderRadius:14,backgroundColor:'#0B5D4B',alignItems:'center',justifyContent:'center'}
});
