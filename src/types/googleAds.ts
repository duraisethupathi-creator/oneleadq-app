export type GoogleAdsStatus = 'draft' | 'review' | 'approved' | 'active' | 'paused' | 'completed';
export type GoogleAdsGoal = 'Leads' | 'Sales' | 'Website traffic' | 'Awareness';

export type GoogleAdsCampaign = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  goal: GoogleAdsGoal;
  dailyBudget: string;
  location: string;
  landingPage: string;
  keywords: string[];
  negativeKeywords: string[];
  searchTerms: string[];
  headlines: string[];
  descriptions: string[];
  status: GoogleAdsStatus;
  spend: string;
  clicks: string;
  impressions: string;
  conversions: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
