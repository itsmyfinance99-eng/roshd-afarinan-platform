/** Shapes of the typed content layer (ADR-0005). They mirror future API DTOs. */

export interface NavItem {
  key: string;
  label: string;
  href: string;
}

export interface Journey {
  key: 'training' | 'feasibility' | 'research' | 'sahamdar';
  title: string;
  description: string;
  href: string;
}

export interface Stat {
  value: string;
  label: string;
  detail: string;
}

export interface ServiceItem {
  key: string;
  title: string;
  description: string;
}

export interface ProcessStep {
  title: string;
  description: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FutureCapability {
  title: string;
  description: string;
}

/** Minimal data for a content card (demo records or CMS summaries). */
export interface EntryCardData {
  id: string;
  title: string;
  summary: string;
  category: string;
  /** ISO date (rendered in the Persian calendar). */
  date: string;
  isDemo: boolean;
}
