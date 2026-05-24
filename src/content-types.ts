import type { Block } from './blocks';

export interface CmsMedia {
  id: number;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

interface Seo {
  title?: string;
  description?: string;
  og_image?: CmsMedia;
}

export interface HomePage {
  announcement?: { text: string; link_url?: string; link_label?: string; active: boolean };
  blocks: Block[];
  seo?: Seo;
}

interface NavLink {
  label: string;
  url: string;
}

interface MegaMenuColumn {
  heading: string;
  links: NavLink[];
}

interface NavItem {
  label: string;
  url: string;
  mega_menu?: {
    columns: MegaMenuColumn[];
    feature_banner?: { id: number } | null;
  };
}

export interface Navigation {
  top_announcement?: { text: string; link_url?: string; link_label?: string };
  items: NavItem[];
}

interface FooterColumn {
  heading: string;
  links: NavLink[];
}

export interface Footer {
  columns: FooterColumn[];
  newsletter: { heading: string; body?: string; terms_url?: string };
  social: Array<{ platform: 'instagram' | 'tiktok' | 'pinterest' | 'facebook' | 'youtube'; url: string }>;
  payment_icons: CmsMedia[];
  legal_links: NavLink[];
  shipping_note?: string;
}

export interface Story {
  slug: string;
  title: string;
  subtitle?: string;
  hero_image?: CmsMedia;
  author?: string;
  published_at?: string;
  tags: string[];
  body: Block[];
  related_products: string[];
  seo?: Seo;
}

export interface LookbookShot {
  image: CmsMedia;
  caption?: string;
  products: string[];
}

export interface Lookbook {
  slug: string;
  title: string;
  hero_image?: CmsMedia;
  shots: LookbookShot[];
  body?: Block[];
  seo?: Seo;
}

export interface SizeGuide {
  slug: string;
  title: string;
  description?: unknown;
  measurement_table: { columns: string[]; rows: string[][] };
  how_to_measure?: unknown;
}

export interface Banner {
  key: string;
  eyebrow?: string;
  headline: string;
  subhead?: string;
  image: CmsMedia;
  mobile_image?: CmsMedia;
  cta_label?: string;
  cta_url?: string;
  theme: 'light' | 'dark';
}

export interface UspBarSingleton {
  items: Array<{ icon: 'shipping' | 'returns' | 'payment' | 'support'; text: string }>;
}

export interface LandingPage {
  slug: string;
  title: string;
  blocks: Block[];
  active_from?: string;
  active_until?: string;
  seo?: Seo;
}
