import type { CmsMedia } from './content-types';

export type BlockType =
  | 'hero'
  | 'editorial_split'
  | 'image_grid'
  | 'category_tiles'
  | 'story_row'
  | 'product_carousel'
  | 'lookbook_strip'
  | 'marquee'
  | 'newsletter_cta'
  | 'usp_bar'
  | 'spacer'
  | 'richtext'
  | 'video'
  | 'cta_strip';

interface BaseBlock<TType extends BlockType, TProps> {
  type: TType;
  props: TProps;
}

export type HeroBlock = BaseBlock<'hero', {
  image: CmsMedia;
  mobile_image?: CmsMedia;
  eyebrow?: string;
  headline: string;
  sublabel?: string;
  cta_label?: string;
  cta_url?: string;
  alignment?: 'left' | 'center';
  theme?: 'light' | 'dark';
}>;

export type EditorialSplitBlock = BaseBlock<'editorial_split', {
  left: { image: CmsMedia; label: string; url: string };
  right: { image: CmsMedia; label: string; url: string };
}>;

export type ImageGridBlock = BaseBlock<'image_grid', {
  layout: 2 | 3 | 4;
  items: Array<{ image: CmsMedia; label?: string; url?: string }>;
}>;

export type CategoryTilesBlock = BaseBlock<'category_tiles', {
  items: Array<{ image: CmsMedia; label: string; url: string; span?: 1 | 2 }>;
}>;

export type StoryRowBlock = BaseBlock<'story_row', {
  heading: string;
  story_ids: number[];
}>;

export type ProductCarouselBlock = BaseBlock<'product_carousel', {
  heading: string;
  source: 'manual' | 'category' | 'tag';
  skus?: string[];
  category?: string;
  tag?: string;
  limit?: number;
}>;

export type LookbookStripBlock = BaseBlock<'lookbook_strip', {
  lookbook_id: number;
}>;

export type MarqueeBlock = BaseBlock<'marquee', {
  text: string;
  speed?: 'slow' | 'normal' | 'fast';
  theme?: 'light' | 'dark';
}>;

export type NewsletterCtaBlock = BaseBlock<'newsletter_cta', {
  heading: string;
  body?: string;
  terms_url?: string;
}>;

export type UspBarBlock = BaseBlock<'usp_bar',
  | { items: Array<{ icon: string; text: string }> }
  | { ref: 'singleton' }
>;

export type SpacerBlock = BaseBlock<'spacer', {
  height_mobile: number;
  height_desktop: number;
}>;

export type RichtextBlock = BaseBlock<'richtext', {
  content: unknown;
}>;

export type VideoBlock = BaseBlock<'video', {
  src: string;
  poster?: CmsMedia;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
}>;

export type CtaStripBlock = BaseBlock<'cta_strip', {
  headline: string;
  cta_label: string;
  cta_url: string;
  background_image?: CmsMedia;
}>;

export type Block =
  | HeroBlock
  | EditorialSplitBlock
  | ImageGridBlock
  | CategoryTilesBlock
  | StoryRowBlock
  | ProductCarouselBlock
  | LookbookStripBlock
  | MarqueeBlock
  | NewsletterCtaBlock
  | UspBarBlock
  | SpacerBlock
  | RichtextBlock
  | VideoBlock
  | CtaStripBlock;
