export interface ProviderMediaInput {
  filename: string;
  mimetype: string;
  path?: string;
  // the name the person receiving the file sees (the stored file may carry another one)
  displayName?: string;
  data?: Buffer;
}
