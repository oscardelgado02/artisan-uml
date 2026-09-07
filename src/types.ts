export interface MenuItem {
  label: string;
  action?: () => void;
  danger?: boolean;
  sub?: MenuItem[];
}

export type MenuEntry = MenuItem | '-';
