import {
  AlarmClock, ArrowLeftRight, ChartPie, CheckCheck, ChevronUp, GitBranch, UserX, Atom, BadgeCheck, Banknote, Bell, Briefcase, Building2, Cake, Calculator, Calendar, CalendarDays, Camera, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleX, Clock, ClockAlert, Coffee, Download, Eye, EyeOff, FileClock,
  ExternalLink, FileHeart, FileSpreadsheet, FileText, Filter, Fingerprint, FlaskConical, GraduationCap, HandCoins, HeartPulse, History, Hourglass, House,
  IdCard, Image, Inbox, Info, KeyRound, Landmark, Layers, LayoutDashboard, ListChecks, Lock, LogIn, LogOut, Mail, MapPin, Medal, Megaphone,
  Menu, MessageCircle, Monitor, Moon, Network, Palette, PartyPopper, Pencil, Phone, Plane, Plus, Printer, Receipt, Repeat, Rocket, Search, Send, Settings,
  ShieldCheck, SlidersHorizontal, Sparkles, Star, Sun, Timer, Trash2, TrendingUp, Trophy, Undo2, Upload, User, UserCheck, UserPlus, Users,
  Wallet, X, Maximize, Copy, Target, type LucideIcon,
} from 'lucide-react';

const IKON: Record<string, LucideIcon> = {
  'alarm-clock': AlarmClock, 'chart-pie': ChartPie, 'check-check': CheckCheck, 'chevron-up': ChevronUp, 'git-branch': GitBranch, 'user-x': UserX,
  'arrow-left-right': ArrowLeftRight, atom: Atom, 'badge-check': BadgeCheck, banknote: Banknote, bell: Bell, briefcase: Briefcase,
  'building-2': Building2, cake: Cake, calculator: Calculator, calendar: Calendar, 'calendar-days': CalendarDays, camera: Camera,
  check: Check, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'circle-alert': CircleAlert,
  'circle-check': CircleCheck, 'circle-x': CircleX, clock: Clock, 'clock-alert': ClockAlert, coffee: Coffee, download: Download, eye: Eye,
  'eye-off': EyeOff, 'external-link': ExternalLink, 'file-clock': FileClock, 'file-heart': FileHeart, 'file-spreadsheet': FileSpreadsheet, 'file-text': FileText,
  filter: Filter, fingerprint: Fingerprint, 'flask-conical': FlaskConical, 'graduation-cap': GraduationCap, 'hand-coins': HandCoins,
  'heart-pulse': HeartPulse, history: History, hourglass: Hourglass, house: House, 'id-card': IdCard, image: Image, inbox: Inbox, info: Info,
  'key-round': KeyRound, landmark: Landmark, layers: Layers, 'layout-dashboard': LayoutDashboard, 'list-checks': ListChecks, lock: Lock,
  'log-in': LogIn, 'log-out': LogOut, mail: Mail, 'map-pin': MapPin, medal: Medal, megaphone: Megaphone, menu: Menu, monitor: Monitor,
  moon: Moon, network: Network, palette: Palette, 'party-popper': PartyPopper, pencil: Pencil, phone: Phone, plane: Plane, plus: Plus,
  printer: Printer, receipt: Receipt, repeat: Repeat, rocket: Rocket, search: Search, send: Send, settings: Settings, whatsapp: MessageCircle,
  'shield-check': ShieldCheck, 'sliders-horizontal': SlidersHorizontal, sparkles: Sparkles, star: Star, sun: Sun, timer: Timer,
  'trash-2': Trash2, 'trending-up': TrendingUp, trophy: Trophy, 'undo-2': Undo2, upload: Upload, user: User, 'user-check': UserCheck,
  'user-plus': UserPlus, users: Users, wallet: Wallet, x: X, maximize: Maximize, copy: Copy, target: Target, 'message-circle': MessageCircle,
};

export function Ikon({ n, className, size }: { n: string; className?: string; size?: number }) {
  const C = IKON[n] ?? CircleAlert;
  return <C className={'ik' + (className ? ' ' + className : '')} size={size} strokeWidth={2} aria-hidden="true" />;
}
