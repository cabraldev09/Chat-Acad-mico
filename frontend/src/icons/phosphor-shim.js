// The icons of the whole system: Phosphor (duotone) served under the names of the Lucide icons that the screens already import.
// vite.config.js sends every `lucide-react` import (and the Material icons, which were already served by Lucide) here, so one file changes every screen.
// Small utility icons (arrows, carets, check, close, dots) stay in the "regular" weight: a duotone fill is noise at 14 px.
import React from "react";
import {
  Alarm as PhAlarm,
  Archive as PhArchive,
  ArrowBendUpLeft as PhArrowBendUpLeft,
  ArrowCounterClockwise as PhArrowCounterClockwise,
  ArrowDown as PhArrowDown,
  ArrowDownLeft as PhArrowDownLeft,
  ArrowDownRight as PhArrowDownRight,
  ArrowElbowDownRight as PhArrowElbowDownRight,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  ArrowSquareOut as PhArrowSquareOut,
  ArrowUUpLeft as PhArrowUUpLeft,
  ArrowUp as PhArrowUp,
  ArrowUpRight as PhArrowUpRight,
  ArrowsClockwise as PhArrowsClockwise,
  Bell as PhBell,
  BellRinging as PhBellRinging,
  BellSlash as PhBellSlash,
  BookOpen as PhBookOpen,
  BookOpenText as PhBookOpenText,
  Books as PhBooks,
  Briefcase as PhBriefcase,
  Bug as PhBug,
  Buildings as PhBuildings,
  Calculator as PhCalculator,
  Calendar as PhCalendar,
  CalendarBlank as PhCalendarBlank,
  CalendarCheck as PhCalendarCheck,
  CalendarDots as PhCalendarDots,
  CalendarX as PhCalendarX,
  Camera as PhCamera,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUp as PhCaretUp,
  CellSignalFull as PhCellSignalFull,
  CellSignalMedium as PhCellSignalMedium,
  ChartBar as PhChartBar,
  ChartBarHorizontal as PhChartBarHorizontal,
  ChartLine as PhChartLine,
  Chat as PhChat,
  ChatCircle as PhChatCircle,
  Chats as PhChats,
  Check as PhCheck,
  CheckCircle as PhCheckCircle,
  CheckSquare as PhCheckSquare,
  Checks as PhChecks,
  Circle as PhCircle,
  CircleDashed as PhCircleDashed,
  Clipboard as PhClipboard,
  ClipboardText as PhClipboardText,
  Clock as PhClock,
  ClockCounterClockwise as PhClockCounterClockwise,
  Cloud as PhCloud,
  CloudArrowUp as PhCloudArrowUp,
  Code as PhCode,
  Compass as PhCompass,
  Copy as PhCopy,
  CopySimple as PhCopySimple,
  CreditCard as PhCreditCard,
  Crosshair as PhCrosshair,
  CurrencyCircleDollar as PhCurrencyCircleDollar,
  Database as PhDatabase,
  DotsThree as PhDotsThree,
  DotsThreeVertical as PhDotsThreeVertical,
  DownloadSimple as PhDownloadSimple,
  Envelope as PhEnvelope,
  EnvelopeOpen as PhEnvelopeOpen,
  Eye as PhEye,
  EyeSlash as PhEyeSlash,
  Eyedropper as PhEyedropper,
  FileArrowDown as PhFileArrowDown,
  FileArrowUp as PhFileArrowUp,
  FileMagnifyingGlass as PhFileMagnifyingGlass,
  FilePlus as PhFilePlus,
  FileText as PhFileText,
  FilmStrip as PhFilmStrip,
  Fingerprint as PhFingerprint,
  Fire as PhFire,
  Flag as PhFlag,
  FloppyDisk as PhFloppyDisk,
  FlowArrow as PhFlowArrow,
  Folder as PhFolder,
  Folders as PhFolders,
  Funnel as PhFunnel,
  Gauge as PhGauge,
  Gear as PhGear,
  Gift as PhGift,
  GitBranch as PhGitBranch,
  Globe as PhGlobe,
  GraduationCap as PhGraduationCap,
  GridFour as PhGridFour,
  Headphones as PhHeadphones,
  Heart as PhHeart,
  Heartbeat as PhHeartbeat,
  Hourglass as PhHourglass,
  House as PhHouse,
  IdentificationCard as PhIdentificationCard,
  Image as PhImage,
  Info as PhInfo,
  Kanban as PhKanban,
  Key as PhKey,
  Layout as PhLayout,
  Lightbulb as PhLightbulb,
  Lightning as PhLightning,
  Link as PhLink,
  List as PhList,
  ListChecks as PhListChecks,
  ListNumbers as PhListNumbers,
  Lock as PhLock,
  MagnifyingGlass as PhMagnifyingGlass,
  MapPin as PhMapPin,
  MapTrifold as PhMapTrifold,
  Megaphone as PhMegaphone,
  Microphone as PhMicrophone,
  Minus as PhMinus,
  MinusCircle as PhMinusCircle,
  Money as PhMoney,
  Monitor as PhMonitor,
  Moon as PhMoon,
  Note as PhNote,
  Palette as PhPalette,
  PaperPlaneRight as PhPaperPlaneRight,
  PaperPlaneTilt as PhPaperPlaneTilt,
  Paperclip as PhPaperclip,
  Path as PhPath,
  Pause as PhPause,
  PencilLine as PhPencilLine,
  PencilSimple as PhPencilSimple,
  Phone as PhPhone,
  PhoneCall as PhPhoneCall,
  Plant as PhPlant,
  Play as PhPlay,
  PlayCircle as PhPlayCircle,
  Plug as PhPlug,
  Plugs as PhPlugs,
  PlugsConnected as PhPlugsConnected,
  Plus as PhPlus,
  PlusCircle as PhPlusCircle,
  Prohibit as PhProhibit,
  ProhibitInset as PhProhibitInset,
  Pulse as PhPulse,
  PushPin as PhPushPin,
  PushPinSlash as PhPushPinSlash,
  QrCode as PhQrCode,
  Question as PhQuestion,
  Repeat as PhRepeat,
  Robot as PhRobot,
  RocketLaunch as PhRocketLaunch,
  Scales as PhScales,
  SealCheck as PhSealCheck,
  ShareNetwork as PhShareNetwork,
  ShieldCheck as PhShieldCheck,
  Shuffle as PhShuffle,
  Sidebar as PhSidebar,
  SidebarSimple as PhSidebarSimple,
  Sliders as PhSliders,
  SlidersHorizontal as PhSlidersHorizontal,
  Smiley as PhSmiley,
  SpeakerHigh as PhSpeakerHigh,
  SpeakerSlash as PhSpeakerSlash,
  SpinnerGap as PhSpinnerGap,
  Square as PhSquare,
  SquaresFour as PhSquaresFour,
  Stack as PhStack,
  Star as PhStar,
  Sticker as PhSticker,
  Sun as PhSun,
  Table as PhTable,
  Tag as PhTag,
  Target as PhTarget,
  TextAlignLeft as PhTextAlignLeft,
  TextT as PhTextT,
  ThumbsDown as PhThumbsDown,
  Timer as PhTimer,
  Trash as PhTrash,
  Tray as PhTray,
  TreeStructure as PhTreeStructure,
  TrendUp as PhTrendUp,
  Trophy as PhTrophy,
  UploadSimple as PhUploadSimple,
  User as PhUser,
  UserCheck as PhUserCheck,
  UserCircle as PhUserCircle,
  UserGear as PhUserGear,
  UserMinus as PhUserMinus,
  UserPlus as PhUserPlus,
  Users as PhUsers,
  VideoCamera as PhVideoCamera,
  Wallet as PhWallet,
  Warning as PhWarning,
  WarningCircle as PhWarningCircle,
  WebhooksLogo as PhWebhooksLogo,
  WifiHigh as PhWifiHigh,
  WifiSlash as PhWifiSlash,
  X as PhX,
  XCircle as PhXCircle,
} from "@phosphor-icons/react";

const make = (Icon, name, weight) => {
  const C = React.forwardRef(({ size = 24, color = "currentColor", strokeWidth, absoluteStrokeWidth, ...rest }, ref) => (
    React.createElement(Icon, { ref, size, color, weight, ...rest })
  ));
  C.displayName = name;
  return C;
};

export const Activity = make(PhPulse, "Activity", "duotone");
export const AlarmClock = make(PhAlarm, "AlarmClock", "duotone");
export const AlertCircle = make(PhWarningCircle, "AlertCircle", "duotone");
export const AlertTriangle = make(PhWarning, "AlertTriangle", "duotone");
export const AlignLeft = make(PhTextAlignLeft, "AlignLeft", "regular");
export const Archive = make(PhArchive, "Archive", "duotone");
export const ArchiveRestore = make(PhArchive, "ArchiveRestore", "duotone");
export const ArrowDown = make(PhArrowDown, "ArrowDown", "regular");
export const ArrowDownLeft = make(PhArrowDownLeft, "ArrowDownLeft", "regular");
export const ArrowDownRight = make(PhArrowDownRight, "ArrowDownRight", "regular");
export const ArrowLeft = make(PhArrowLeft, "ArrowLeft", "regular");
export const ArrowRight = make(PhArrowRight, "ArrowRight", "regular");
export const ArrowUp = make(PhArrowUp, "ArrowUp", "regular");
export const ArrowUpRight = make(PhArrowUpRight, "ArrowUpRight", "regular");
export const BadgeCheck = make(PhSealCheck, "BadgeCheck", "duotone");
export const Ban = make(PhProhibit, "Ban", "duotone");
export const Banknote = make(PhMoney, "Banknote", "duotone");
export const BarChart3 = make(PhChartBar, "BarChart3", "duotone");
export const Bell = make(PhBell, "Bell", "duotone");
export const BellOff = make(PhBellSlash, "BellOff", "duotone");
export const BellRing = make(PhBellRinging, "BellRing", "duotone");
export const BookOpen = make(PhBookOpen, "BookOpen", "duotone");
export const BookOpenCheck = make(PhBookOpenText, "BookOpenCheck", "duotone");
export const Bot = make(PhRobot, "Bot", "duotone");
export const Briefcase = make(PhBriefcase, "Briefcase", "duotone");
export const Bug = make(PhBug, "Bug", "duotone");
export const Building2 = make(PhBuildings, "Building2", "duotone");
export const Calculator = make(PhCalculator, "Calculator", "duotone");
export const Calendar = make(PhCalendar, "Calendar", "duotone");
export const CalendarCheck2 = make(PhCalendarCheck, "CalendarCheck2", "duotone");
export const CalendarClock = make(PhCalendarDots, "CalendarClock", "duotone");
export const CalendarDays = make(PhCalendarBlank, "CalendarDays", "duotone");
export const CalendarX = make(PhCalendarX, "CalendarX", "duotone");
export const Camera = make(PhCamera, "Camera", "duotone");
export const Check = make(PhCheck, "Check", "regular");
export const CheckCheck = make(PhChecks, "CheckCheck", "regular");
export const CheckCircle2 = make(PhCheckCircle, "CheckCircle2", "duotone");
export const CheckSquare = make(PhCheckSquare, "CheckSquare", "duotone");
export const ChevronDown = make(PhCaretDown, "ChevronDown", "regular");
export const ChevronLeft = make(PhCaretLeft, "ChevronLeft", "regular");
export const ChevronRight = make(PhCaretRight, "ChevronRight", "regular");
export const ChevronUp = make(PhCaretUp, "ChevronUp", "regular");
export const Circle = make(PhCircle, "Circle", "regular");
export const CircleDashed = make(PhCircleDashed, "CircleDashed", "duotone");
export const CircleDollarSign = make(PhCurrencyCircleDollar, "CircleDollarSign", "duotone");
export const CircleSlash = make(PhProhibitInset, "CircleSlash", "duotone");
export const ClipboardCopy = make(PhClipboard, "ClipboardCopy", "duotone");
export const ClipboardPaste = make(PhClipboardText, "ClipboardPaste", "duotone");
export const Clock = make(PhClock, "Clock", "duotone");
export const Clock3 = make(PhClock, "Clock3", "duotone");
export const Cloud = make(PhCloud, "Cloud", "duotone");
export const Code2 = make(PhCode, "Code2", "duotone");
export const Compass = make(PhCompass, "Compass", "duotone");
export const Contact = make(PhIdentificationCard, "Contact", "duotone");
export const Copy = make(PhCopy, "Copy", "duotone");
export const CopyPlus = make(PhCopySimple, "CopyPlus", "duotone");
export const CornerDownRight = make(PhArrowElbowDownRight, "CornerDownRight", "regular");
export const CreditCard = make(PhCreditCard, "CreditCard", "duotone");
export const Database = make(PhDatabase, "Database", "duotone");
export const DatabaseBackup = make(PhDatabase, "DatabaseBackup", "duotone");
export const Download = make(PhDownloadSimple, "Download", "duotone");
export const ExternalLink = make(PhArrowSquareOut, "ExternalLink", "duotone");
export const Eye = make(PhEye, "Eye", "duotone");
export const EyeOff = make(PhEyeSlash, "EyeOff", "duotone");
export const FileBarChart2 = make(PhChartBarHorizontal, "FileBarChart2", "duotone");
export const FileInput = make(PhFileArrowDown, "FileInput", "duotone");
export const FilePlus2 = make(PhFilePlus, "FilePlus2", "duotone");
export const FileSearch = make(PhFileMagnifyingGlass, "FileSearch", "duotone");
export const FileText = make(PhFileText, "FileText", "duotone");
export const FileUp = make(PhFileArrowUp, "FileUp", "duotone");
export const FileWarning = make(PhWarning, "FileWarning", "duotone");
export const Film = make(PhFilmStrip, "Film", "duotone");
export const Filter = make(PhFunnel, "Filter", "duotone");
export const Fingerprint = make(PhFingerprint, "Fingerprint", "duotone");
export const Flag = make(PhFlag, "Flag", "duotone");
export const Flame = make(PhFire, "Flame", "duotone");
export const Folder = make(PhFolder, "Folder", "duotone");
export const Folders = make(PhFolders, "Folders", "duotone");
export const Gauge = make(PhGauge, "Gauge", "duotone");
export const Gift = make(PhGift, "Gift", "duotone");
export const GitBranch = make(PhGitBranch, "GitBranch", "duotone");
export const Globe = make(PhGlobe, "Globe", "duotone");
export const Goal = make(PhCrosshair, "Goal", "duotone");
export const GraduationCap = make(PhGraduationCap, "GraduationCap", "duotone");
export const Headphones = make(PhHeadphones, "Headphones", "duotone");
export const Heart = make(PhHeart, "Heart", "duotone");
export const HeartPulse = make(PhHeartbeat, "HeartPulse", "duotone");
export const HelpCircle = make(PhQuestion, "HelpCircle", "duotone");
export const History = make(PhClockCounterClockwise, "History", "duotone");
export const Home = make(PhHouse, "Home", "duotone");
export const Hourglass = make(PhHourglass, "Hourglass", "duotone");
export const Image = make(PhImage, "Image", "duotone");
export const ImageDown = make(PhImage, "ImageDown", "duotone");
export const ImagePlus = make(PhImage, "ImagePlus", "duotone");
export const Inbox = make(PhTray, "Inbox", "duotone");
export const Info = make(PhInfo, "Info", "regular");
export const KanbanSquare = make(PhKanban, "KanbanSquare", "duotone");
export const Key = make(PhKey, "Key", "duotone");
export const KeyRound = make(PhKey, "KeyRound", "duotone");
export const Layers = make(PhStack, "Layers", "duotone");
export const LayoutDashboard = make(PhSquaresFour, "LayoutDashboard", "duotone");
export const LayoutGrid = make(PhGridFour, "LayoutGrid", "duotone");
export const LayoutTemplate = make(PhLayout, "LayoutTemplate", "duotone");
export const Library = make(PhBooks, "Library", "duotone");
export const Lightbulb = make(PhLightbulb, "Lightbulb", "duotone");
export const LineChart = make(PhChartLine, "LineChart", "duotone");
export const Link2 = make(PhLink, "Link2", "duotone");
export const List = make(PhList, "List", "duotone");
export const ListChecks = make(PhListChecks, "ListChecks", "duotone");
export const ListOrdered = make(PhListNumbers, "ListOrdered", "duotone");
export const ListTodo = make(PhListChecks, "ListTodo", "duotone");
export const ListTree = make(PhTreeStructure, "ListTree", "duotone");
export const Loader2 = make(PhSpinnerGap, "Loader2", "regular");
export const Lock = make(PhLock, "Lock", "duotone");
export const Mail = make(PhEnvelope, "Mail", "duotone");
export const MailOpen = make(PhEnvelopeOpen, "MailOpen", "duotone");
export const Map = make(PhMapTrifold, "Map", "duotone");
export const MapPin = make(PhMapPin, "MapPin", "duotone");
export const Megaphone = make(PhMegaphone, "Megaphone", "duotone");
export const Menu = make(PhList, "Menu", "regular");
export const MessageCircle = make(PhChatCircle, "MessageCircle", "duotone");
export const MessageSquare = make(PhChat, "MessageSquare", "duotone");
export const MessagesSquare = make(PhChats, "MessagesSquare", "duotone");
export const Mic = make(PhMicrophone, "Mic", "duotone");
export const Minus = make(PhMinus, "Minus", "regular");
export const MinusCircle = make(PhMinusCircle, "MinusCircle", "duotone");
export const MonitorCheck = make(PhMonitor, "MonitorCheck", "duotone");
export const Moon = make(PhMoon, "Moon", "duotone");
export const MoreHorizontal = make(PhDotsThree, "MoreHorizontal", "regular");
export const MoreVertical = make(PhDotsThreeVertical, "MoreVertical", "regular");
export const MoveRight = make(PhArrowRight, "MoveRight", "regular");
export const Palette = make(PhPalette, "Palette", "duotone");
export const PanelLeftClose = make(PhSidebarSimple, "PanelLeftClose", "duotone");
export const PanelRight = make(PhSidebar, "PanelRight", "duotone");
export const Paperclip = make(PhPaperclip, "Paperclip", "duotone");
export const Pause = make(PhPause, "Pause", "duotone");
export const Pencil = make(PhPencilSimple, "Pencil", "duotone");
export const Phone = make(PhPhone, "Phone", "duotone");
export const PhoneCall = make(PhPhoneCall, "PhoneCall", "duotone");
export const Pin = make(PhPushPin, "Pin", "duotone");
export const PinOff = make(PhPushPinSlash, "PinOff", "duotone");
export const Pipette = make(PhEyedropper, "Pipette", "duotone");
export const Play = make(PhPlay, "Play", "duotone");
export const PlayCircle = make(PhPlayCircle, "PlayCircle", "duotone");
export const Plug = make(PhPlugs, "Plug", "duotone");
export const Plug2 = make(PhPlug, "Plug2", "duotone");
export const PlugZap = make(PhPlugsConnected, "PlugZap", "duotone");
export const Plus = make(PhPlus, "Plus", "regular");
export const PlusCircle = make(PhPlusCircle, "PlusCircle", "duotone");
export const QrCode = make(PhQrCode, "QrCode", "duotone");
export const RefreshCw = make(PhArrowsClockwise, "RefreshCw", "duotone");
export const Repeat2 = make(PhRepeat, "Repeat2", "duotone");
export const Reply = make(PhArrowBendUpLeft, "Reply", "duotone");
export const Rocket = make(PhRocketLaunch, "Rocket", "duotone");
export const RotateCcw = make(PhArrowCounterClockwise, "RotateCcw", "duotone");
export const Route = make(PhPath, "Route", "duotone");
export const Save = make(PhFloppyDisk, "Save", "duotone");
export const Scale = make(PhScales, "Scale", "duotone");
export const Search = make(PhMagnifyingGlass, "Search", "duotone");
export const Send = make(PhPaperPlaneTilt, "Send", "duotone");
export const SendHorizonal = make(PhPaperPlaneRight, "SendHorizonal", "duotone");
export const SendHorizontal = make(PhPaperPlaneRight, "SendHorizontal", "duotone");
export const Settings = make(PhGear, "Settings", "duotone");
export const Settings2 = make(PhSliders, "Settings2", "duotone");
export const Share2 = make(PhShareNetwork, "Share2", "duotone");
export const ShieldCheck = make(PhShieldCheck, "ShieldCheck", "duotone");
export const Shuffle = make(PhShuffle, "Shuffle", "duotone");
export const SignalHigh = make(PhCellSignalFull, "SignalHigh", "duotone");
export const SignalMedium = make(PhCellSignalMedium, "SignalMedium", "duotone");
export const SlidersHorizontal = make(PhSlidersHorizontal, "SlidersHorizontal", "duotone");
export const Smile = make(PhSmiley, "Smile", "duotone");
export const Sprout = make(PhPlant, "Sprout", "duotone");
export const Square = make(PhSquare, "Square", "regular");
export const Star = make(PhStar, "Star", "duotone");
export const Sticker = make(PhSticker, "Sticker", "duotone");
export const StickyNote = make(PhNote, "StickyNote", "duotone");
export const Sun = make(PhSun, "Sun", "duotone");
export const Table2 = make(PhTable, "Table2", "duotone");
export const Tag = make(PhTag, "Tag", "duotone");
export const Tags = make(PhTag, "Tags", "duotone");
export const Target = make(PhTarget, "Target", "duotone");
export const TextCursorInput = make(PhTextT, "TextCursorInput", "duotone");
export const ThumbsDown = make(PhThumbsDown, "ThumbsDown", "duotone");
export const Timer = make(PhTimer, "Timer", "duotone");
export const Trash2 = make(PhTrash, "Trash2", "duotone");
export const TrendingUp = make(PhTrendUp, "TrendingUp", "duotone");
export const Trophy = make(PhTrophy, "Trophy", "duotone");
export const Type = make(PhTextT, "Type", "duotone");
export const Undo2 = make(PhArrowUUpLeft, "Undo2", "duotone");
export const Upload = make(PhUploadSimple, "Upload", "duotone");
export const UploadCloud = make(PhCloudArrowUp, "UploadCloud", "duotone");
export const User = make(PhUser, "User", "duotone");
export const UserCheck = make(PhUserCheck, "UserCheck", "duotone");
export const UserCircle2 = make(PhUserCircle, "UserCircle2", "duotone");
export const UserCog = make(PhUserGear, "UserCog", "duotone");
export const UserPlus = make(PhUserPlus, "UserPlus", "duotone");
export const UserX = make(PhUserMinus, "UserX", "duotone");
export const Users = make(PhUsers, "Users", "duotone");
export const Video = make(PhVideoCamera, "Video", "duotone");
export const Volume2 = make(PhSpeakerHigh, "Volume2", "duotone");
export const VolumeX = make(PhSpeakerSlash, "VolumeX", "duotone");
export const Wallet = make(PhWallet, "Wallet", "duotone");
export const Wand2 = make(PhPencilLine, "Wand2", "duotone");
export const Webhook = make(PhWebhooksLogo, "Webhook", "duotone");
export const Wifi = make(PhWifiHigh, "Wifi", "duotone");
export const WifiOff = make(PhWifiSlash, "WifiOff", "duotone");
export const Workflow = make(PhFlowArrow, "Workflow", "duotone");
export const X = make(PhX, "X", "regular");
export const XCircle = make(PhXCircle, "XCircle", "duotone");
export const XOctagon = make(PhXCircle, "XOctagon", "duotone");
export const Zap = make(PhLightning, "Zap", "duotone");
