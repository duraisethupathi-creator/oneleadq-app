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
  services: string[]; // OneLeadQ services assigned to this client.
  productsServices?: string[]; // Explicitly verified client-owned catalogue; never inferred from notes/type.
  notes: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
};
