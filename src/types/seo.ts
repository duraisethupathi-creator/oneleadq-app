export type SEOSeverity = 'critical' | 'high' | 'medium' | 'low' | 'opportunity';
export type SEOIssueStatus = 'open' | 'in_progress' | 'fixed' | 'ignored';
export type SEOCategory = 'On-page' | 'Technical' | 'Content' | 'Local SEO';

export type SEOIssue = {
  id: string; clientId: string; clientName: string; category: SEOCategory;
  severity: SEOSeverity; title: string; url: string; why: string;
  recommendation: string; status: SEOIssueStatus;
};

export type SEOKeyword = {
  id: string; clientId: string; keyword: string; location: string;
  currentPosition: string; targetPosition: string; intent: string;
};

export type SEOProfile = {
  clientId: string; clientName: string; website: string;
  overall: number; onPage: number; technical: number; content: number; local: number;
  googleBusiness: string; searchConsole: string; lastAudit: string;
};
