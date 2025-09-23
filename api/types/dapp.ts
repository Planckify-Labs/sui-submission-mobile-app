export interface TDappCategory {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TDapp {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  categoryId: string;
  isPopular: boolean;
  isSponsor: boolean;
  isHighlight: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  bgColor: string;
  category: TDappCategory;
  isFavorite: boolean;
}

export type DappListResponse = TDapp[];

export interface TDappSearchParams {
  name?: string;
  categoryId?: string;
  isPopular?: boolean;
  isSponsor?: boolean;
  isHighlight?: boolean;
  isActive?: boolean;
  isFavorite?: boolean;
  take?: number;
  cursor?: string;
}
