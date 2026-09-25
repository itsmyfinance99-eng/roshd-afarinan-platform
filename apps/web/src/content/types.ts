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

/** Every demo record carries `isDemo: true`; the UI must show a «نمونه نمایشی» label for it. */
interface DemoFlag {
  isDemo: true;
}

export type SectorKey = 'mining' | 'industry' | 'energy' | 'agri' | 'infra';

export interface DemoProject extends DemoFlag {
  id: string;
  title: string;
  sector: SectorKey;
  sectorLabel: string;
  location: string;
  stage: string;
  service: string;
}

export interface DemoCourse extends DemoFlag {
  id: string;
  title: string;
  category: string;
  instructor: string;
  level: string;
  duration: string;
  free: boolean;
}

export interface DemoEntry extends DemoFlag {
  id: string;
  title: string;
  summary: string;
  category: string;
  /** ISO date (rendered in the Persian calendar). */
  date: string;
}
