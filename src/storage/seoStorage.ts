import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultSEOIssues, defaultSEOKeywords, defaultSEOProfiles } from '../data/defaultSeo';
import { SEOIssue, SEOKeyword, SEOProfile } from '../types/seo';

const P='@oneleadq/seo-profiles/v1', I='@oneleadq/seo-issues/v1', K='@oneleadq/seo-keywords/v1';

async function read<T>(key:string, fallback:T):Promise<T>{
 const raw=await AsyncStorage.getItem(key);
 if(!raw){await AsyncStorage.setItem(key,JSON.stringify(fallback));return fallback;}
 try{return JSON.parse(raw) as T;}catch{await AsyncStorage.setItem(key,JSON.stringify(fallback));return fallback;}
}
export const loadSEOProfiles=()=>read<SEOProfile[]>(P,defaultSEOProfiles);
export const loadSEOIssues=()=>read<SEOIssue[]>(I,defaultSEOIssues);
export const loadSEOKeywords=()=>read<SEOKeyword[]>(K,defaultSEOKeywords);
export const saveSEOIssues=(x:SEOIssue[])=>AsyncStorage.setItem(I,JSON.stringify(x));
export const saveSEOKeywords=(x:SEOKeyword[])=>AsyncStorage.setItem(K,JSON.stringify(x));
