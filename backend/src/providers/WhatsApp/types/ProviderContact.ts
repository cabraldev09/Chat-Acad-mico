export interface ProviderContact {
  id: string;
  name?: string;
  pushname?: string;
  number: string;
  profilePicUrl?: string;
  isGroup: boolean;
  // WhatsApp's internal id for people it does not identify by phone number
  lid?: string;
}
