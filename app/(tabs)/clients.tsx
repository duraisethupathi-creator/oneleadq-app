import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { defaultClients } from '../../src/data/defaultClients';
import { loadClients, saveClients } from '../../src/storage/clientStorage';
import { colors } from '../../src/theme';
import { Client } from '../../src/types/client';

const serviceOptions = ['Meta Ads','Google Ads','SEO','Local SEO','Content','Web Development','Mobile App'];
const blank = (): Client => ({
  id: '', name: '', businessType: '', contactName: '', phone: '', email: '', website: '',
  location: '', services: [], notes: '', status: 'active',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

export default function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Client | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);

  useEffect(() => {
    loadClients().then(setClients).catch(() => {
      setClients(defaultClients);
      Alert.alert('Storage error','Client data could not be loaded.');
    }).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => clients.filter(c => showArchived ? c.status === 'archived' : c.status === 'active'),
    [clients, showArchived],
  );

  async function commit(next: Client[]) {
    setClients(next);
    try { await saveClients(next); }
    catch { Alert.alert('Save failed','The change is visible now but could not be saved on this device.'); }
  }

  function openNew() { setEditor(blank()); }
  function openEdit(c: Client) { setSelected(null); setEditor({...c}); }

  function saveEditor() {
    if (!editor?.name.trim()) return Alert.alert('Client name required','Enter a business/client name.');
    const now = new Date().toISOString();
    const isNew = !editor.id;
    const saved: Client = {
      ...editor, name: editor.name.trim(),
      id: editor.id || `client-${Date.now()}`,
      createdAt: editor.createdAt || now, updatedAt: now,
    };
    const next = isNew ? [saved, ...clients] : clients.map(c => c.id === saved.id ? saved : c);
    commit(next); setEditor(null);
  }

  function archive(c: Client) {
    Alert.alert('Archive client?', `${c.name} will leave the active list. History stays available.`, [
      {text:'Cancel',style:'cancel'},
      {text:'Archive',onPress:()=>{commit(clients.map(x=>x.id===c.id?{...x,status:'archived',updatedAt:new Date().toISOString()}:x));setSelected(null);}},
    ]);
  }
  function restore(c: Client) {
    commit(clients.map(x=>x.id===c.id?{...x,status:'active',updatedAt:new Date().toISOString()}:x));
    setSelected(null);
  }
  function permanentDelete(c: Client) {
    Alert.alert('Permanently delete?', `Delete ${c.name} from this device? This cannot be undone.`, [
      {text:'Cancel',style:'cancel'},
      {text:'Delete permanently',style:'destructive',onPress:()=>{commit(clients.filter(x=>x.id!==c.id));setSelected(null);}},
    ]);
  }

  if (loading) return <SafeAreaView style={s.page}><View style={s.center}><Text style={s.muted}>Loading clients…</Text></View></SafeAreaView>;

  return <SafeAreaView style={s.page} edges={['top']}>
    <View style={s.header}>
      <View><Text style={s.head}>Clients</Text><Text style={s.sub}>OneLeadQ client workspaces</Text></View>
      <Pressable style={s.add} onPress={openNew}><Ionicons name="add" size={24} color={colors.white}/><Text style={s.addText}>Add</Text></Pressable>
    </View>
    <View style={s.switchRow}>
      <Pressable style={[s.filter,!showArchived&&s.filterOn]} onPress={()=>setShowArchived(false)}><Text style={[s.filterText,!showArchived&&s.filterTextOn]}>Active ({clients.filter(x=>x.status==='active').length})</Text></Pressable>
      <Pressable style={[s.filter,showArchived&&s.filterOn]} onPress={()=>setShowArchived(true)}><Text style={[s.filterText,showArchived&&s.filterTextOn]}>Archived ({clients.filter(x=>x.status==='archived').length})</Text></Pressable>
    </View>
    <FlatList data={visible} keyExtractor={x=>x.id} contentContainerStyle={s.list}
      ListEmptyComponent={<View style={s.empty}><Ionicons name="people-outline" size={40} color={colors.muted}/><Text style={s.emptyTitle}>{showArchived?'No archived clients':'No active clients'}</Text><Text style={s.muted}>{showArchived?'Archived clients will appear here.':'Tap Add to create your first client.'}</Text></View>}
      renderItem={({item})=><Pressable style={s.card} onPress={()=>setSelected(item)}>
        <View style={s.avatar}><Text style={s.avatarText}>{item.name.slice(0,2).toUpperCase()}</Text></View>
        <View style={s.cardBody}><Text style={s.name}>{item.name}</Text><Text style={s.meta}>{item.businessType || 'Business'}{item.location ? ` · ${item.location}` : ''}</Text><Text style={s.services} numberOfLines={2}>{item.services.length?item.services.join(' · '):'No services selected'}</Text></View>
        <Ionicons name="chevron-forward" size={22} color={colors.muted}/>
      </Pressable>}
    />

    <Modal visible={!!selected} animationType="slide" onRequestClose={()=>setSelected(null)}>
      <SafeAreaView style={s.modalPage}>
        <View style={s.modalTop}><Pressable onPress={()=>setSelected(null)}><Ionicons name="close" size={28} color={colors.green}/></Pressable><Text style={s.modalTitle}>Client workspace</Text><Pressable onPress={()=>selected&&openEdit(selected)}><Text style={s.edit}>Edit</Text></Pressable></View>
        {selected&&<ScrollView contentContainerStyle={s.detail}>
          <View style={s.detailHero}><Text style={s.detailName}>{selected.name}</Text><Text style={s.detailType}>{selected.businessType||'Business client'}</Text><View style={s.badge}><Text style={s.badgeText}>{selected.status.toUpperCase()}</Text></View></View>
          <Text style={s.section}>Business details</Text>
          <Info label="Contact" value={selected.contactName}/><Info label="Phone" value={selected.phone}/><Info label="Email" value={selected.email}/><Info label="Website" value={selected.website}/><Info label="Location" value={selected.location}/>
          <Text style={s.section}>Services</Text>
          <View style={s.chips}>{selected.services.length?selected.services.map(x=><View key={x} style={s.chip}><Text style={s.chipText}>{x}</Text></View>):<Text style={s.muted}>No services selected.</Text>}</View>
          <Text style={s.section}>Notes</Text><Text style={s.notes}>{selected.notes||'No notes yet.'}</Text>
          {selected.status==='active'
            ? <Pressable style={s.archiveBtn} onPress={()=>archive(selected)}><Text style={s.archiveText}>Archive client</Text></Pressable>
            : <><Pressable style={s.restoreBtn} onPress={()=>restore(selected)}><Text style={s.restoreText}>Restore client</Text></Pressable><Pressable style={s.deleteBtn} onPress={()=>permanentDelete(selected)}><Text style={s.deleteText}>Delete permanently</Text></Pressable></>}
        </ScrollView>}
      </SafeAreaView>
    </Modal>

    <Modal visible={!!editor} animationType="slide" onRequestClose={()=>setEditor(null)}>
      <SafeAreaView style={s.modalPage}>
        <View style={s.modalTop}><Pressable onPress={()=>setEditor(null)}><Text style={s.cancel}>Cancel</Text></Pressable><Text style={s.modalTitle}>{editor?.id?'Edit client':'Add client'}</Text><Pressable onPress={saveEditor}><Text style={s.edit}>Save</Text></Pressable></View>
        {editor&&<ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
          <Field label="Client / business name *" value={editor.name} onChangeText={v=>setEditor({...editor,name:v})}/>
          <Field label="Business type" value={editor.businessType} onChangeText={v=>setEditor({...editor,businessType:v})}/>
          <Field label="Contact person" value={editor.contactName} onChangeText={v=>setEditor({...editor,contactName:v})}/>
          <Field label="Phone" value={editor.phone} keyboardType="phone-pad" onChangeText={v=>setEditor({...editor,phone:v})}/>
          <Field label="Email" value={editor.email} keyboardType="email-address" onChangeText={v=>setEditor({...editor,email:v})}/>
          <Field label="Website" value={editor.website} onChangeText={v=>setEditor({...editor,website:v})}/>
          <Field label="Location" value={editor.location} onChangeText={v=>setEditor({...editor,location:v})}/>
          <Text style={s.fieldLabel}>Services</Text>
          <View style={s.chips}>{serviceOptions.map(x=>{const on=editor.services.includes(x);return <Pressable key={x} style={[s.choice,on&&s.choiceOn]} onPress={()=>setEditor({...editor,services:on?editor.services.filter(y=>y!==x):[...editor.services,x]})}><Text style={[s.choiceText,on&&s.choiceTextOn]}>{x}</Text></Pressable>})}</View>
          <Field label="Notes" value={editor.notes} multiline onChangeText={v=>setEditor({...editor,notes:v})}/>
          <Pressable style={s.saveBtn} onPress={saveEditor}><Text style={s.saveText}>Save client</Text></Pressable>
        </ScrollView>}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

function Info({label,value}:{label:string;value:string}) { return <View style={s.info}><Text style={s.infoLabel}>{label}</Text><Text style={s.infoValue}>{value||'—'}</Text></View>; }
function Field({label,...props}:{label:string;value:string;onChangeText:(v:string)=>void;keyboardType?:any;multiline?:boolean}) { return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor="#91A09A" style={[s.input,props.multiline&&s.multi]} autoCapitalize={props.keyboardType==='email-address'?'none':'sentences'}/></View>; }

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:colors.cream},center:{flex:1,alignItems:'center',justifyContent:'center'},header:{padding:20,paddingBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},head:{fontSize:30,fontWeight:'900',color:colors.green},sub:{color:colors.muted,marginTop:3},add:{backgroundColor:colors.green,borderRadius:14,paddingHorizontal:14,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:5},addText:{color:colors.white,fontWeight:'800'},switchRow:{flexDirection:'row',paddingHorizontal:20,gap:10},filter:{paddingHorizontal:15,paddingVertical:9,borderRadius:20,borderWidth:1,borderColor:'#D8D2BA'},filterOn:{backgroundColor:colors.green,borderColor:colors.green},filterText:{color:colors.green,fontWeight:'700'},filterTextOn:{color:colors.white},list:{padding:20,paddingBottom:100},card:{backgroundColor:colors.white,borderRadius:20,padding:16,marginBottom:12,flexDirection:'row',alignItems:'center',gap:13},avatar:{width:48,height:48,borderRadius:16,backgroundColor:'#E8E1BE',alignItems:'center',justifyContent:'center'},avatarText:{fontWeight:'900',color:colors.green},cardBody:{flex:1},name:{fontSize:18,fontWeight:'900',color:colors.text},meta:{fontSize:12,color:colors.muted,marginTop:3},services:{color:colors.green2,marginTop:7,lineHeight:19},empty:{alignItems:'center',paddingTop:80,gap:8},emptyTitle:{fontSize:18,fontWeight:'800',color:colors.text},muted:{color:colors.muted},modalPage:{flex:1,backgroundColor:colors.cream},modalTop:{height:58,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#E7E1CE'},modalTitle:{fontSize:17,fontWeight:'900',color:colors.text},edit:{fontWeight:'900',color:colors.green},cancel:{color:colors.muted,fontWeight:'700'},detail:{padding:20,paddingBottom:50},detailHero:{backgroundColor:colors.green,borderRadius:22,padding:22},detailName:{fontSize:27,fontWeight:'900',color:colors.white},detailType:{color:'#D6E3DE',marginTop:5},badge:{alignSelf:'flex-start',backgroundColor:'#FFFFFF20',paddingHorizontal:10,paddingVertical:5,borderRadius:12,marginTop:15},badgeText:{color:colors.gold,fontWeight:'900',fontSize:11},section:{fontSize:17,fontWeight:'900',color:colors.text,marginTop:24,marginBottom:10},info:{backgroundColor:colors.white,padding:14,borderRadius:13,marginBottom:7},infoLabel:{fontSize:11,color:colors.muted,textTransform:'uppercase'},infoValue:{color:colors.text,fontWeight:'700',marginTop:3},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{backgroundColor:'#E9F1EE',paddingHorizontal:11,paddingVertical:7,borderRadius:12},chipText:{color:colors.green,fontWeight:'700'},notes:{backgroundColor:colors.white,padding:15,borderRadius:14,color:colors.text,lineHeight:21},archiveBtn:{borderWidth:1,borderColor:'#B7791F',padding:15,borderRadius:14,alignItems:'center',marginTop:28},archiveText:{color:'#8A5A12',fontWeight:'900'},restoreBtn:{backgroundColor:colors.green,padding:15,borderRadius:14,alignItems:'center',marginTop:28},restoreText:{color:colors.white,fontWeight:'900'},deleteBtn:{padding:15,alignItems:'center',marginTop:8},deleteText:{color:colors.danger,fontWeight:'900'},form:{padding:20,paddingBottom:50},field:{marginBottom:15},fieldLabel:{color:colors.text,fontWeight:'800',marginBottom:7},input:{backgroundColor:colors.white,borderWidth:1,borderColor:'#DED8C3',borderRadius:14,paddingHorizontal:14,paddingVertical:12,color:colors.text,fontSize:16},multi:{minHeight:95,textAlignVertical:'top'},choice:{borderWidth:1,borderColor:'#D8D2BA',paddingHorizontal:12,paddingVertical:8,borderRadius:13},choiceOn:{backgroundColor:colors.green,borderColor:colors.green},choiceText:{color:colors.green,fontWeight:'700'},choiceTextOn:{color:colors.white},saveBtn:{backgroundColor:colors.green,padding:16,borderRadius:15,alignItems:'center',marginTop:26},saveText:{color:colors.white,fontWeight:'900',fontSize:16},
});
