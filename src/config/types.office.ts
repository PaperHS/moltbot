export type OfficeConfig = {
  default?: OfficeAccountConfig;
  [accountId: string]: OfficeAccountConfig | undefined;
};

export type OfficeAccountConfig = {
  enabled?: boolean;
  name?: string;
  url?: string;
  apiKey?: string;
};
