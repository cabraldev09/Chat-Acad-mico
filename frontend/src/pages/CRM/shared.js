import React, { useEffect, useState } from "react";
import { Avatar } from "@material-ui/core";
import {
  Globe, Search, UserPlus, Flag, MapPin, Phone, Upload, Target,
} from "lucide-react";
import { formatDistanceToNowStrict, parseISO, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

import api from "../../services/api";
import {
  WhatsAppBrand, InstagramBrand, FacebookBrand, TelegramBrand,
} from "../../icons/brands";

export const useCrmOptions = () => {
  const [options, setOptions] = useState({});
  const [courses, setCourses] = useState([]);
  const [stages, setStages] = useState([]);
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  useEffect(() => {
    api.get("/crm/options").then(({ data }) => setOptions(data)).catch(() => {});
    api.get("/courses").then(({ data }) => setCourses(data)).catch(() => {});
    api.get("/lead-stages").then(({ data }) => setStages(data)).catch(() => {});
    api.get("/users", { params: { pageNumber: 1 } }).then(({ data }) => setUsers(data.users || [])).catch(() => {});
    api.get("/tags").then(({ data }) => setTags(data)).catch(() => {});
  }, []);
  return { options, courses, stages, users, tags };
};

const SOURCE_ICONS = {
  WhatsApp: WhatsAppBrand,
  Instagram: InstagramBrand,
  Facebook: FacebookBrand,
  Telegram: TelegramBrand,
  "Site / formulário": Globe,
  Google: Search,
  "Indicação": UserPlus,
  "Evento / feira": Flag,
  "Visita presencial": MapPin,
  "Ligação": Phone,
  "Importação": Upload,
};

export const SourceIcon = ({ source, size = 14 }) => {
  const Icon = SOURCE_ICONS[source] || Target;
  const brand = ["WhatsApp", "Instagram", "Facebook", "Telegram"].includes(source);
  return brand ? <Icon size={size} /> : <Icon size={size} strokeWidth={2} />;
};

export const scoreTone = (s) =>
  s >= 70 ? { fg: "#16a34a", bg: "rgba(22,163,74,.12)", label: "Quente" }
    : s >= 40 ? { fg: "#d97706", bg: "rgba(217,119,6,.12)", label: "Morno" }
      : { fg: "#64748b", bg: "rgba(100,116,139,.14)", label: "Frio" };

export const ScoreRing = ({ value = 0, size = 30 }) => {
  const tone = scoreTone(value);
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span title={`Pontuação ${value} · ${tone.label}`} style={{ position: "relative", width: size, height: size, display: "inline-grid", placeItems: "center", flex: "none" }}>
      <svg width={size} height={size} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone.bg} strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone.fg} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`} style={{ transition: "stroke-dasharray .6s var(--ease-out)" }} />
      </svg>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: tone.fg }}>{value}</span>
    </span>
  );
};

export const ago = (iso) =>
  iso ? formatDistanceToNowStrict(parseISO(iso), { locale: ptBR, addSuffix: true }) : "—";

// compact "agora / 5 min / 2 h / 3 d" for tight spaces like cards
export const short = (iso) => {
  if (!iso) return "—";
  const s = (Date.now() - parseISO(iso).getTime()) / 1000;
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
};

export const isOverdue = (iso) => !!iso && isPast(parseISO(iso));

export const initials = (name) =>
  String(name || "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");

export const OwnerAvatar = ({ owner, size = 22 }) =>
  owner ? (
    <Avatar title={owner.name} style={{ width: size, height: size, fontSize: size * 0.45, background: "#0B4279", color: "#fff" }}>
      {initials(owner.name)}
    </Avatar>
  ) : (
    <Avatar title="Sem responsável" style={{ width: size, height: size, fontSize: size * 0.45, background: "transparent", color: "#94a3b8", border: "1px dashed #94a3b8" }}>
      ?
    </Avatar>
  );

// Small celebration when a lead is enrolled
export const burst = (x, y) => {
  const colors = ["#0B4279", "#0693E3", "#FEF84C", "#16a34a", "#f97316"];
  for (let i = 0; i < 28; i += 1) {
    const el = document.createElement("span");
    const size = 6 + Math.random() * 6;
    Object.assign(el.style, {
      position: "fixed", left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size * 0.5}px`,
      background: colors[i % colors.length], borderRadius: "2px", pointerEvents: "none", zIndex: 99999,
    });
    document.body.appendChild(el);
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 140;
    el.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist + 80}px) rotate(${Math.random() * 540}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 500, easing: "cubic-bezier(.22,1,.36,1)" }
    ).onfinish = () => el.remove();
  }
};
