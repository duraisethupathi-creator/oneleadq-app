import { SEOIssue, SEOKeyword, SEOProfile } from '../types/seo';

export const defaultSEOProfiles: SEOProfile[] = [{
  clientId:'catchy-decors', clientName:'Catchy Decors', website:'www.catchydecors.in',
  overall:72, onPage:78, technical:64, content:70, local:76,
  googleBusiness:'Not connected', searchConsole:'Not connected', lastAudit:'DEMO DATA'
}];

export const defaultSEOIssues: SEOIssue[] = [
 {id:'seo-1',clientId:'catchy-decors',clientName:'Catchy Decors',category:'Technical',severity:'high',title:'Review page indexing and sitemap',url:'www.catchydecors.in',why:'Search engines need clear crawl and index signals.',recommendation:'Validate sitemap, robots rules, canonicals and indexability for important pages.',status:'open'},
 {id:'seo-2',clientId:'catchy-decors',clientName:'Catchy Decors',category:'On-page',severity:'medium',title:'Strengthen service page titles and headings',url:'www.catchydecors.in',why:'Clear titles and headings help describe each service and location.',recommendation:'Use unique titles, H1s and supporting headings around each real service and target location.',status:'open'},
 {id:'seo-3',clientId:'catchy-decors',clientName:'Catchy Decors',category:'Local SEO',severity:'opportunity',title:'Improve local service signals',url:'www.catchydecors.in',why:'Local relevance can be strengthened with consistent business and service information.',recommendation:'Keep business details consistent and build useful Karur-focused service content without keyword stuffing.',status:'open'}
];

export const defaultSEOKeywords: SEOKeyword[] = [
 {id:'kw-1',clientId:'catchy-decors',keyword:'custom curtains karur',location:'Karur, Tamil Nadu',currentPosition:'Not connected',targetPosition:'Top 10',intent:'Commercial'},
 {id:'kw-2',clientId:'catchy-decors',keyword:'curtain shop karur',location:'Karur, Tamil Nadu',currentPosition:'Not connected',targetPosition:'Top 10',intent:'Local'},
 {id:'kw-3',clientId:'catchy-decors',keyword:'blinds karur',location:'Karur, Tamil Nadu',currentPosition:'Not connected',targetPosition:'Top 10',intent:'Commercial'}
];
