export type ClientStatus = 'active' | 'archived';

export type Client = {
  id: string;
  name: string;
  businessType: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  location: string;
  services: string[];
  notes: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
};
