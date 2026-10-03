export type ContentPlatform='Facebook'|'Instagram'|'Reel'|'Story'|'Google Business'|'Blog'|'Ad Copy';
export type ContentLanguage='English'|'Tamil'|'Tamil + English';
export type ContentStatus='draft'|'review'|'approved'|'scheduled'|'published'|'rejected';
export type ContentItem={id:string;clientId:string;clientName:string;platform:ContentPlatform;topic:string;goal:string;language:ContentLanguage;tone:string;cta:string;audience:string;location:string;body:string;hashtags:string;status:ContentStatus;scheduledAt:string;createdAt:string;updatedAt:string;};
