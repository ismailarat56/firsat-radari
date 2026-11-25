import {
  Activity,
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  FolderOpen,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  Link,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
  BriefcaseBusiness,
  Rss,
  AlertCircle,
  Archive,
  Undo2,
  LogOut,
  Download,
  HardDrive,
  Pause,
  Play,
  CheckCircle2,
  Eye,
  Trash2,
  WifiOff,
  Sun,
  Command,
  Circle,
  Copy,
  Database,
  LockKeyhole,
  ArrowLeft,
} from 'lucide-react';
const icons = {
  Activity,
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  FolderOpen,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  Link,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
  BriefcaseBusiness,
  Rss,
  AlertCircle,
  Archive,
  Undo2,
  LogOut,
  Download,
  HardDrive,
  Pause,
  Play,
  CheckCircle2,
  Eye,
  Trash2,
  WifiOff,
  Sun,
  Command,
  Circle,
  Copy,
  Database,
  LockKeyhole,
  ArrowLeft,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 18,
  ...props
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const Component = icons[name];
  return <Component size={size} strokeWidth={1.8} aria-hidden="true" {...props} />;
}
export function RadarMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={className}>
      <circle cx="20" cy="20" r="16.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="20" cy="20" r="10.5" stroke="currentColor" strokeWidth="1.4" opacity=".65" />
      <circle cx="20" cy="20" r="4" stroke="currentColor" strokeWidth="1.3" opacity=".4" />
      <path d="M20 20 32 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="13" r="2.4" fill="currentColor" />
      <circle cx="20" cy="20" r="2" fill="currentColor" />
    </svg>
  );
}
