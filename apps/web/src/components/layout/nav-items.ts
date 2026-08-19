import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckSquare,
  FileBarChart,
  FolderKanban,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden unless the user holds one of these permissions. */
  permissions?: string[];
  description?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Work',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'What needs you today' },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare, description: 'Every task you can see' },
      { href: '/approvals', label: 'Approvals', icon: ShieldCheck, description: 'Decisions waiting on you' },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays, description: 'Deadlines by date' },
      { href: '/projects', label: 'Projects', icon: FolderKanban, description: 'Delivery by project' },
    ],
  },
  {
    label: 'Insight',
    items: [
      {
        href: '/analytics',
        label: 'Bottlenecks',
        icon: BarChart3,
        permissions: ['view_analytics'],
        description: 'Where work is getting stuck',
      },
      {
        href: '/reports',
        label: 'Reports',
        icon: FileBarChart,
        permissions: ['view_reports'],
        description: 'Exportable performance reports',
      },
    ],
  },
  {
    label: 'Organisation',
    items: [
      { href: '/organization', label: 'Directory', icon: Building2, description: 'People and reporting lines' },
      {
        href: '/admin',
        label: 'Administration',
        icon: Settings,
        permissions: [
          'manage_users',
          'manage_organization',
          'manage_workflows',
          'manage_settings',
          'view_audit_logs',
        ],
        description: 'Users, workflows and settings',
      },
    ],
  },
];

export const ADMIN_TABS: NavItem[] = [
  { href: '/admin/users', label: 'Users', icon: Users, permissions: ['manage_users'] },
  {
    href: '/admin/organization',
    label: 'Departments & positions',
    icon: Building2,
    permissions: ['manage_organization'],
  },
  {
    href: '/admin/workflows',
    label: 'Workflows',
    icon: FolderKanban,
    permissions: ['manage_workflows'],
  },
  { href: '/admin/roles', label: 'Roles & permissions', icon: ShieldCheck, permissions: ['manage_roles'] },
  { href: '/admin/settings', label: 'System settings', icon: Settings, permissions: ['manage_settings'] },
  { href: '/admin/audit', label: 'Audit log', icon: FileBarChart, permissions: ['view_audit_logs'] },
];
