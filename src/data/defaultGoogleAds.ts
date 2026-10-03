import { GoogleAdsCampaign } from '../types/googleAds';

const now = new Date().toISOString();

export const defaultGoogleAds: GoogleAdsCampaign[] = [{
  id: 'gads-1',
  clientId: 'catchy-decors',
  clientName: 'Catchy Decors',
  name: 'Custom Curtains Karur Search',
  goal: 'Leads',
  dailyBudget: '500',
  location: 'Karur, Tamil Nadu',
  landingPage: 'https://www.catchydecors.in',
  keywords: ['custom curtains karur', 'curtain shop karur', 'blinds karur'],
  negativeKeywords: ['free', 'jobs'],
  searchTerms: ['DEMO DATA - Google Ads API not connected'],
  headlines: ['Custom Curtains in Karur', 'Premium Curtains & Blinds', 'Book a Home Consultation'],
  descriptions: ['Made-to-measure curtains and blinds for homes in Karur.'],
  status: 'draft',
  spend: '0',
  clicks: '0',
  impressions: '0',
  conversions: '0',
  notes: 'DEMO DATA - Planning only. Google Ads API is not connected yet.',
  createdAt: now,
  updatedAt: now,
}];
