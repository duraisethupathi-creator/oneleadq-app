import { Client } from '../types/client';

const now = new Date().toISOString();

export const defaultClients: Client[] = [
  {
    id: 'catchy-decors',
    name: 'Catchy Decors',
    businessType: 'Home Interiors',
    contactName: '',
    phone: '',
    email: '',
    website: 'www.catchydecors.in',
    location: 'Karur, Tamil Nadu',
    services: ['Meta Ads', 'SEO', 'Local SEO', 'Web Development'],
    notes: 'DEMO DATA — OneLeadQ client workspace.',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'ar-bangles',
    name: 'AR Bangles',
    businessType: 'Fashion & Accessories',
    contactName: '',
    phone: '',
    email: '',
    website: '',
    location: 'Karur, Tamil Nadu',
    services: ['Meta Ads'],
    notes: 'DEMO DATA — OneLeadQ client workspace.',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  },
];
