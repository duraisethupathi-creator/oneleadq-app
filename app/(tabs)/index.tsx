import { ScrollView,StyleSheet,Text,View,Pressable } from 'react-native';
import { colors } from '../../src/theme';

const metrics=[['Today Tasks','6'],['Approvals','3'],['Scheduled','4'],['SEO Issues','8']];
export default function Dashboard(){
 return <ScrollView style={s.page} contentContainerStyle={s.content}>
   <View style={s.hero}><Text style={s.brand}>ONELEADQ</Text><Text style={s.tag}>ONE STRATEGY. INFINITE GROWTH.</Text><Text style={s.hi}>Agency Command Center</Text><Text style={s.sub}>Current client · Catchy Decors</Text></View>
   <Text style={s.title}>Overview</Text>
   <View style={s.grid}>{metrics.map(([k,v])=><View style={s.card} key={k}><Text style={s.num}>{v}</Text><Text style={s.label}>{k}</Text></View>)}</View>
   <Text style={s.title}>Quick actions</Text>
   <View style={s.actions}>{['+ Client','Create Content','SEO Check','Report'].map(x=><Pressable style={s.action} key={x}><Text style={s.actionText}>{x}</Text></Pressable>)}</View>
   <View style={s.ai}><Text style={s.aiTitle}>AI Assistant</Text><Text style={s.aiText}>AI connection will be added in the final integration stage.</Text></View>
 </ScrollView>
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:colors.cream},content:{paddingBottom:28},hero:{backgroundColor:colors.green,paddingTop:58,paddingHorizontal:20,paddingBottom:26,borderBottomLeftRadius:28,borderBottomRightRadius:28},brand:{color:colors.gold,fontSize:28,fontWeight:'900',letterSpacing:1},tag:{color:'#E8D89A',fontSize:10,letterSpacing:1.2,marginTop:2},hi:{color:colors.white,fontSize:22,fontWeight:'800',marginTop:24},sub:{color:'#D7E2DE',marginTop:5},title:{fontSize:18,fontWeight:'800',color:colors.text,margin:20,marginBottom:12},grid:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:14},card:{width:'46%',margin:'2%',backgroundColor:colors.white,padding:18,borderRadius:18},num:{fontSize:28,fontWeight:'900',color:colors.green},label:{color:colors.muted,marginTop:5},actions:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:14},action:{width:'46%',margin:'2%',borderWidth:1,borderColor:'#E0D5A7',backgroundColor:'#FFFDF6',padding:15,borderRadius:15},actionText:{color:colors.green,fontWeight:'800'},ai:{margin:20,backgroundColor:colors.green2,padding:20,borderRadius:20},aiTitle:{color:colors.gold,fontSize:18,fontWeight:'900'},aiText:{color:colors.white,marginTop:6,lineHeight:20}});
