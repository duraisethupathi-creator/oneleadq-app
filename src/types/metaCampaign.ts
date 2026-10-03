export type MetaObjective = 'Awareness' | 'Traffic' | 'Engagement' | 'Leads' | 'Sales';
export type MetaCampaignStatus = 'draft' | 'review' | 'approved' | 'active' | 'paused' | 'completed';

export type MetaCampaign = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  objective: MetaObjective;
  dailyBudget: string;
  audience: string;
  location: string;
  creative: string;
  status: MetaCampaignStatus;
  spend: string;
  results: string;
  reach: string;
  impressions: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
