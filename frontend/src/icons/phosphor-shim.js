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
  Sparkle as PhSparkle,
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
  ThumbsUp as PhThumbsUp,
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
  MagnifyingGlassPlus as PhMagnifyingGlassPlus,
  MagnifyingGlassMinus as PhMagnifyingGlassMinus,
} from "@phosphor-icons/react";

// Big icons (40 px and up) use the clean line ("regular"): at that size the 20% fill of the duotone becomes a heavy flat patch.
// strokeWidth (a Lucide prop the screens already pass) picks the weight of the line: thin for 1.5 or less, bold for 2.5 or more.
const weightOf = (weight, size, strokeWidth) => {
  const px = typeof size === "number" ? size : parseFloat(size) || 24;
  const sw = Number(strokeWidth);
  if (sw && sw <= 1.5) return "light";
  if (sw && sw >= 2.5) return "bold";
  return weight === "duotone" && px >= 40 ? "regular" : weight;
};
const make = (Icon, name, weight) => {
  const C = React.forwardRef(({ size = 24, color = "currentColor", strokeWidth, absoluteStrokeWidth, ...rest }, ref) => (
    React.createElement(Icon, { ref, size, color, weight: weightOf(weight, size, strokeWidth), ...rest })
  ));
  C.displayName = name;
  return C;
};

export const Activity = /*#__PURE__*/ make(PhPulse, "Activity", "duotone");
export const AlarmClock = /*#__PURE__*/ make(PhAlarm, "AlarmClock", "duotone");
export const AlertCircle = /*#__PURE__*/ make(PhWarningCircle, "AlertCircle", "duotone");
export const AlertTriangle = /*#__PURE__*/ make(PhWarning, "AlertTriangle", "duotone");
export const AlignLeft = /*#__PURE__*/ make(PhTextAlignLeft, "AlignLeft", "regular");
export const Archive = /*#__PURE__*/ make(PhArchive, "Archive", "duotone");
export const ArchiveRestore = /*#__PURE__*/ make(PhArchive, "ArchiveRestore", "duotone");
export const ArrowDown = /*#__PURE__*/ make(PhArrowDown, "ArrowDown", "regular");
export const ArrowDownLeft = /*#__PURE__*/ make(PhArrowDownLeft, "ArrowDownLeft", "regular");
export const ArrowDownRight = /*#__PURE__*/ make(PhArrowDownRight, "ArrowDownRight", "regular");
export const ArrowLeft = /*#__PURE__*/ make(PhArrowLeft, "ArrowLeft", "regular");
export const ArrowRight = /*#__PURE__*/ make(PhArrowRight, "ArrowRight", "regular");
export const ArrowUp = /*#__PURE__*/ make(PhArrowUp, "ArrowUp", "regular");
export const ArrowUpRight = /*#__PURE__*/ make(PhArrowUpRight, "ArrowUpRight", "regular");
export const BadgeCheck = /*#__PURE__*/ make(PhSealCheck, "BadgeCheck", "duotone");
export const Ban = /*#__PURE__*/ make(PhProhibit, "Ban", "duotone");
export const Banknote = /*#__PURE__*/ make(PhMoney, "Banknote", "duotone");
export const BarChart3 = /*#__PURE__*/ make(PhChartBar, "BarChart3", "duotone");
export const Bell = /*#__PURE__*/ make(PhBell, "Bell", "duotone");
export const BellOff = /*#__PURE__*/ make(PhBellSlash, "BellOff", "duotone");
export const BellRing = /*#__PURE__*/ make(PhBellRinging, "BellRing", "duotone");
export const BookOpen = /*#__PURE__*/ make(PhBookOpen, "BookOpen", "duotone");
export const BookOpenCheck = /*#__PURE__*/ make(PhBookOpenText, "BookOpenCheck", "duotone");
export const Bot = /*#__PURE__*/ make(PhRobot, "Bot", "duotone");
export const Briefcase = /*#__PURE__*/ make(PhBriefcase, "Briefcase", "duotone");
export const Bug = /*#__PURE__*/ make(PhBug, "Bug", "duotone");
export const Building2 = /*#__PURE__*/ make(PhBuildings, "Building2", "duotone");
export const Calculator = /*#__PURE__*/ make(PhCalculator, "Calculator", "duotone");
export const Calendar = /*#__PURE__*/ make(PhCalendar, "Calendar", "duotone");
export const CalendarCheck2 = /*#__PURE__*/ make(PhCalendarCheck, "CalendarCheck2", "duotone");
export const CalendarClock = /*#__PURE__*/ make(PhCalendarDots, "CalendarClock", "duotone");
export const CalendarDays = /*#__PURE__*/ make(PhCalendarBlank, "CalendarDays", "duotone");
export const CalendarX = /*#__PURE__*/ make(PhCalendarX, "CalendarX", "duotone");
export const Camera = /*#__PURE__*/ make(PhCamera, "Camera", "duotone");
export const Check = /*#__PURE__*/ make(PhCheck, "Check", "regular");
export const CheckCheck = /*#__PURE__*/ make(PhChecks, "CheckCheck", "regular");
export const CheckCircle2 = /*#__PURE__*/ make(PhCheckCircle, "CheckCircle2", "duotone");
export const CheckSquare = /*#__PURE__*/ make(PhCheckSquare, "CheckSquare", "duotone");
export const ChevronDown = /*#__PURE__*/ make(PhCaretDown, "ChevronDown", "regular");
export const ChevronLeft = /*#__PURE__*/ make(PhCaretLeft, "ChevronLeft", "regular");
export const ChevronRight = /*#__PURE__*/ make(PhCaretRight, "ChevronRight", "regular");
export const ChevronUp = /*#__PURE__*/ make(PhCaretUp, "ChevronUp", "regular");
export const Circle = /*#__PURE__*/ make(PhCircle, "Circle", "regular");
export const CircleDashed = /*#__PURE__*/ make(PhCircleDashed, "CircleDashed", "duotone");
export const CircleDollarSign = /*#__PURE__*/ make(PhCurrencyCircleDollar, "CircleDollarSign", "duotone");
export const CircleSlash = /*#__PURE__*/ make(PhProhibitInset, "CircleSlash", "duotone");
export const ClipboardCopy = /*#__PURE__*/ make(PhClipboard, "ClipboardCopy", "duotone");
export const ClipboardList = /*#__PURE__*/ make(PhClipboardText, "ClipboardList", "duotone");
export const ClipboardPaste = /*#__PURE__*/ make(PhClipboardText, "ClipboardPaste", "duotone");
export const Clock = /*#__PURE__*/ make(PhClock, "Clock", "duotone");
export const Clock3 = /*#__PURE__*/ make(PhClock, "Clock3", "duotone");
export const Cloud = /*#__PURE__*/ make(PhCloud, "Cloud", "duotone");
export const Code2 = /*#__PURE__*/ make(PhCode, "Code2", "duotone");
export const Compass = /*#__PURE__*/ make(PhCompass, "Compass", "duotone");
export const Contact = /*#__PURE__*/ make(PhIdentificationCard, "Contact", "duotone");
export const Copy = /*#__PURE__*/ make(PhCopy, "Copy", "duotone");
export const CopyPlus = /*#__PURE__*/ make(PhCopySimple, "CopyPlus", "duotone");
export const CornerDownRight = /*#__PURE__*/ make(PhArrowElbowDownRight, "CornerDownRight", "regular");
export const CreditCard = /*#__PURE__*/ make(PhCreditCard, "CreditCard", "duotone");
export const Database = /*#__PURE__*/ make(PhDatabase, "Database", "duotone");
export const DatabaseBackup = /*#__PURE__*/ make(PhDatabase, "DatabaseBackup", "duotone");
export const Download = /*#__PURE__*/ make(PhDownloadSimple, "Download", "duotone");
export const ZoomIn = /*#__PURE__*/ make(PhMagnifyingGlassPlus, "ZoomIn", "duotone");
export const ZoomOut = /*#__PURE__*/ make(PhMagnifyingGlassMinus, "ZoomOut", "duotone");
export const ExternalLink = /*#__PURE__*/ make(PhArrowSquareOut, "ExternalLink", "duotone");
export const Eye = /*#__PURE__*/ make(PhEye, "Eye", "duotone");
export const EyeOff = /*#__PURE__*/ make(PhEyeSlash, "EyeOff", "duotone");
export const FileBarChart2 = /*#__PURE__*/ make(PhChartBarHorizontal, "FileBarChart2", "duotone");
export const FileInput = /*#__PURE__*/ make(PhFileArrowDown, "FileInput", "duotone");
export const FilePlus2 = /*#__PURE__*/ make(PhFilePlus, "FilePlus2", "duotone");
export const FileSearch = /*#__PURE__*/ make(PhFileMagnifyingGlass, "FileSearch", "duotone");
export const FileText = /*#__PURE__*/ make(PhFileText, "FileText", "duotone");
export const FileUp = /*#__PURE__*/ make(PhFileArrowUp, "FileUp", "duotone");
export const FileWarning = /*#__PURE__*/ make(PhWarning, "FileWarning", "duotone");
export const Film = /*#__PURE__*/ make(PhFilmStrip, "Film", "duotone");
export const Filter = /*#__PURE__*/ make(PhFunnel, "Filter", "duotone");
export const Fingerprint = /*#__PURE__*/ make(PhFingerprint, "Fingerprint", "duotone");
export const Flag = /*#__PURE__*/ make(PhFlag, "Flag", "duotone");
export const Flame = /*#__PURE__*/ make(PhFire, "Flame", "duotone");
export const Folder = /*#__PURE__*/ make(PhFolder, "Folder", "duotone");
export const Folders = /*#__PURE__*/ make(PhFolders, "Folders", "duotone");
export const Gauge = /*#__PURE__*/ make(PhGauge, "Gauge", "duotone");
export const Gift = /*#__PURE__*/ make(PhGift, "Gift", "duotone");
export const GitBranch = /*#__PURE__*/ make(PhGitBranch, "GitBranch", "duotone");
export const Globe = /*#__PURE__*/ make(PhGlobe, "Globe", "duotone");
export const Goal = /*#__PURE__*/ make(PhCrosshair, "Goal", "duotone");
export const GraduationCap = /*#__PURE__*/ make(PhGraduationCap, "GraduationCap", "duotone");
export const Headphones = /*#__PURE__*/ make(PhHeadphones, "Headphones", "duotone");
export const Heart = /*#__PURE__*/ make(PhHeart, "Heart", "duotone");
export const HeartPulse = /*#__PURE__*/ make(PhHeartbeat, "HeartPulse", "duotone");
export const HelpCircle = /*#__PURE__*/ make(PhQuestion, "HelpCircle", "duotone");
export const History = /*#__PURE__*/ make(PhClockCounterClockwise, "History", "duotone");
export const Home = /*#__PURE__*/ make(PhHouse, "Home", "duotone");
export const Hourglass = /*#__PURE__*/ make(PhHourglass, "Hourglass", "duotone");
export const Image = /*#__PURE__*/ make(PhImage, "Image", "duotone");
export const ImageDown = /*#__PURE__*/ make(PhImage, "ImageDown", "duotone");
export const ImagePlus = /*#__PURE__*/ make(PhImage, "ImagePlus", "duotone");
export const Inbox = /*#__PURE__*/ make(PhTray, "Inbox", "duotone");
export const Info = /*#__PURE__*/ make(PhInfo, "Info", "regular");
export const KanbanSquare = /*#__PURE__*/ make(PhKanban, "KanbanSquare", "duotone");
export const Key = /*#__PURE__*/ make(PhKey, "Key", "duotone");
export const KeyRound = /*#__PURE__*/ make(PhKey, "KeyRound", "duotone");
export const Layers = /*#__PURE__*/ make(PhStack, "Layers", "duotone");
export const LayoutDashboard = /*#__PURE__*/ make(PhSquaresFour, "LayoutDashboard", "duotone");
export const LayoutGrid = /*#__PURE__*/ make(PhGridFour, "LayoutGrid", "duotone");
export const LayoutTemplate = /*#__PURE__*/ make(PhLayout, "LayoutTemplate", "duotone");
export const Library = /*#__PURE__*/ make(PhBooks, "Library", "duotone");
export const Lightbulb = /*#__PURE__*/ make(PhLightbulb, "Lightbulb", "duotone");
export const LineChart = /*#__PURE__*/ make(PhChartLine, "LineChart", "duotone");
export const Link2 = /*#__PURE__*/ make(PhLink, "Link2", "duotone");
export const List = /*#__PURE__*/ make(PhList, "List", "duotone");
export const ListChecks = /*#__PURE__*/ make(PhListChecks, "ListChecks", "duotone");
export const ListOrdered = /*#__PURE__*/ make(PhListNumbers, "ListOrdered", "duotone");
export const ListTodo = /*#__PURE__*/ make(PhListChecks, "ListTodo", "duotone");
export const ListTree = /*#__PURE__*/ make(PhTreeStructure, "ListTree", "duotone");
export const Loader2 = /*#__PURE__*/ make(PhSpinnerGap, "Loader2", "regular");
export const Lock = /*#__PURE__*/ make(PhLock, "Lock", "duotone");
export const Mail = /*#__PURE__*/ make(PhEnvelope, "Mail", "duotone");
export const MailOpen = /*#__PURE__*/ make(PhEnvelopeOpen, "MailOpen", "duotone");
export const Map = /*#__PURE__*/ make(PhMapTrifold, "Map", "duotone");
export const MapPin = /*#__PURE__*/ make(PhMapPin, "MapPin", "duotone");
export const Megaphone = /*#__PURE__*/ make(PhMegaphone, "Megaphone", "duotone");
export const Menu = /*#__PURE__*/ make(PhList, "Menu", "regular");
export const MessageCircle = /*#__PURE__*/ make(PhChatCircle, "MessageCircle", "duotone");
export const MessageSquare = /*#__PURE__*/ make(PhChat, "MessageSquare", "duotone");
export const MessagesSquare = /*#__PURE__*/ make(PhChats, "MessagesSquare", "duotone");
export const Mic = /*#__PURE__*/ make(PhMicrophone, "Mic", "duotone");
export const Minus = /*#__PURE__*/ make(PhMinus, "Minus", "regular");
export const MinusCircle = /*#__PURE__*/ make(PhMinusCircle, "MinusCircle", "duotone");
export const MonitorCheck = /*#__PURE__*/ make(PhMonitor, "MonitorCheck", "duotone");
export const Moon = /*#__PURE__*/ make(PhMoon, "Moon", "duotone");
export const MoreHorizontal = /*#__PURE__*/ make(PhDotsThree, "MoreHorizontal", "regular");
export const MoreVertical = /*#__PURE__*/ make(PhDotsThreeVertical, "MoreVertical", "regular");
export const MoveRight = /*#__PURE__*/ make(PhArrowRight, "MoveRight", "regular");
export const Palette = /*#__PURE__*/ make(PhPalette, "Palette", "duotone");
export const PanelLeftClose = /*#__PURE__*/ make(PhSidebarSimple, "PanelLeftClose", "duotone");
export const PanelRight = /*#__PURE__*/ make(PhSidebar, "PanelRight", "duotone");
export const Paperclip = /*#__PURE__*/ make(PhPaperclip, "Paperclip", "duotone");
export const Pause = /*#__PURE__*/ make(PhPause, "Pause", "duotone");
export const Pencil = /*#__PURE__*/ make(PhPencilSimple, "Pencil", "duotone");
export const Phone = /*#__PURE__*/ make(PhPhone, "Phone", "duotone");
export const PhoneCall = /*#__PURE__*/ make(PhPhoneCall, "PhoneCall", "duotone");
export const Pin = /*#__PURE__*/ make(PhPushPin, "Pin", "duotone");
export const PinOff = /*#__PURE__*/ make(PhPushPinSlash, "PinOff", "duotone");
export const Pipette = /*#__PURE__*/ make(PhEyedropper, "Pipette", "duotone");
export const Play = /*#__PURE__*/ make(PhPlay, "Play", "duotone");
export const PlayCircle = /*#__PURE__*/ make(PhPlayCircle, "PlayCircle", "duotone");
export const Plug = /*#__PURE__*/ make(PhPlugs, "Plug", "duotone");
export const Plug2 = /*#__PURE__*/ make(PhPlug, "Plug2", "duotone");
export const PlugZap = /*#__PURE__*/ make(PhPlugsConnected, "PlugZap", "duotone");
export const Plus = /*#__PURE__*/ make(PhPlus, "Plus", "regular");
export const PlusCircle = /*#__PURE__*/ make(PhPlusCircle, "PlusCircle", "duotone");
export const QrCode = /*#__PURE__*/ make(PhQrCode, "QrCode", "duotone");
export const RefreshCw = /*#__PURE__*/ make(PhArrowsClockwise, "RefreshCw", "duotone");
export const Repeat2 = /*#__PURE__*/ make(PhRepeat, "Repeat2", "duotone");
export const Reply = /*#__PURE__*/ make(PhArrowBendUpLeft, "Reply", "duotone");
export const Rocket = /*#__PURE__*/ make(PhRocketLaunch, "Rocket", "duotone");
export const RotateCcw = /*#__PURE__*/ make(PhArrowCounterClockwise, "RotateCcw", "duotone");
export const Route = /*#__PURE__*/ make(PhPath, "Route", "duotone");
export const Save = /*#__PURE__*/ make(PhFloppyDisk, "Save", "duotone");
export const Scale = /*#__PURE__*/ make(PhScales, "Scale", "duotone");
export const Search = /*#__PURE__*/ make(PhMagnifyingGlass, "Search", "duotone");
export const Send = /*#__PURE__*/ make(PhPaperPlaneTilt, "Send", "duotone");
export const SendHorizonal = /*#__PURE__*/ make(PhPaperPlaneRight, "SendHorizonal", "duotone");
export const SendHorizontal = /*#__PURE__*/ make(PhPaperPlaneRight, "SendHorizontal", "duotone");
export const Settings = /*#__PURE__*/ make(PhGear, "Settings", "duotone");
export const Settings2 = /*#__PURE__*/ make(PhSliders, "Settings2", "duotone");
export const Share2 = /*#__PURE__*/ make(PhShareNetwork, "Share2", "duotone");
export const ShieldCheck = /*#__PURE__*/ make(PhShieldCheck, "ShieldCheck", "duotone");
export const Shuffle = /*#__PURE__*/ make(PhShuffle, "Shuffle", "duotone");
export const SignalHigh = /*#__PURE__*/ make(PhCellSignalFull, "SignalHigh", "duotone");
export const SignalMedium = /*#__PURE__*/ make(PhCellSignalMedium, "SignalMedium", "duotone");
export const SlidersHorizontal = /*#__PURE__*/ make(PhSlidersHorizontal, "SlidersHorizontal", "duotone");
export const Smile = /*#__PURE__*/ make(PhSmiley, "Smile", "duotone");
export const Sprout = /*#__PURE__*/ make(PhPlant, "Sprout", "duotone");
export const Square = /*#__PURE__*/ make(PhSquare, "Square", "regular");
export const Star = /*#__PURE__*/ make(PhStar, "Star", "duotone");
export const Sticker = /*#__PURE__*/ make(PhSticker, "Sticker", "duotone");
export const StickyNote = /*#__PURE__*/ make(PhNote, "StickyNote", "duotone");
export const Sun = /*#__PURE__*/ make(PhSun, "Sun", "duotone");
export const Table2 = /*#__PURE__*/ make(PhTable, "Table2", "duotone");
export const Tag = /*#__PURE__*/ make(PhTag, "Tag", "duotone");
export const Tags = /*#__PURE__*/ make(PhTag, "Tags", "duotone");
export const Target = /*#__PURE__*/ make(PhTarget, "Target", "duotone");
export const TextCursorInput = /*#__PURE__*/ make(PhTextT, "TextCursorInput", "duotone");
export const ThumbsDown = /*#__PURE__*/ make(PhThumbsDown, "ThumbsDown", "duotone");
export const ThumbsUp = /*#__PURE__*/ make(PhThumbsUp, "ThumbsUp", "duotone");
export const Timer = /*#__PURE__*/ make(PhTimer, "Timer", "duotone");
export const Trash2 = /*#__PURE__*/ make(PhTrash, "Trash2", "duotone");
export const TrendingUp = /*#__PURE__*/ make(PhTrendUp, "TrendingUp", "duotone");
export const Trophy = /*#__PURE__*/ make(PhTrophy, "Trophy", "duotone");
export const Type = /*#__PURE__*/ make(PhTextT, "Type", "duotone");
export const Undo2 = /*#__PURE__*/ make(PhArrowUUpLeft, "Undo2", "duotone");
export const Upload = /*#__PURE__*/ make(PhUploadSimple, "Upload", "duotone");
export const UploadCloud = /*#__PURE__*/ make(PhCloudArrowUp, "UploadCloud", "duotone");
export const User = /*#__PURE__*/ make(PhUser, "User", "duotone");
export const UserCheck = /*#__PURE__*/ make(PhUserCheck, "UserCheck", "duotone");
export const UserCircle2 = /*#__PURE__*/ make(PhUserCircle, "UserCircle2", "duotone");
export const UserCog = /*#__PURE__*/ make(PhUserGear, "UserCog", "duotone");
export const UserPlus = /*#__PURE__*/ make(PhUserPlus, "UserPlus", "duotone");
export const UserX = /*#__PURE__*/ make(PhUserMinus, "UserX", "duotone");
export const Users = /*#__PURE__*/ make(PhUsers, "Users", "duotone");
export const Video = /*#__PURE__*/ make(PhVideoCamera, "Video", "duotone");
export const Volume2 = /*#__PURE__*/ make(PhSpeakerHigh, "Volume2", "duotone");
export const VolumeX = /*#__PURE__*/ make(PhSpeakerSlash, "VolumeX", "duotone");
export const Wallet = /*#__PURE__*/ make(PhWallet, "Wallet", "duotone");
export const Wand2 = /*#__PURE__*/ make(PhPencilLine, "Wand2", "duotone");
export const Webhook = /*#__PURE__*/ make(PhWebhooksLogo, "Webhook", "duotone");
export const Wifi = /*#__PURE__*/ make(PhWifiHigh, "Wifi", "duotone");
export const WifiOff = /*#__PURE__*/ make(PhWifiSlash, "WifiOff", "duotone");
export const Workflow = /*#__PURE__*/ make(PhFlowArrow, "Workflow", "duotone");
export const X = /*#__PURE__*/ make(PhX, "X", "regular");
export const XCircle = /*#__PURE__*/ make(PhXCircle, "XCircle", "duotone");
export const XOctagon = /*#__PURE__*/ make(PhXCircle, "XOctagon", "duotone");
export const Zap = /*#__PURE__*/ make(PhLightning, "Zap", "duotone");

export const Sparkles = /*#__PURE__*/ make(PhSparkle, "Sparkles", "duotone");
