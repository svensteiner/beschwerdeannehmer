declare module "virtual:grok-og-identity" {
  export const grokOgIdentity: {
    includeExtensions: boolean;
    site: {
      title?: string;
      description?: string;
      type?: string;
      card?: string;
      image?: string;
      banner?: string;
      color?: string;
    };
  };
}
