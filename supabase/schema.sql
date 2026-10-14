-- Chat Acadêmico — esquema PostgreSQL para o Supabase (gerado das migrations).
-- Duas formas de criar o banco (use UMA):
--   A) npm run db:migrate no backend, com DATABASE_URL apontando para o Supabase (recomendado).
--   B) colar este arquivo no SQL Editor do Supabase (cria tudo + marca as migrations como aplicadas).

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Homebrew)
-- Dumped by pg_dump version 16.15 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AiAgents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AiAgents" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    provider character varying(255) DEFAULT 'anthropic'::character varying NOT NULL,
    model character varying(255) NOT NULL,
    "apiKey" text,
    "systemPrompt" text,
    "knowledgeBase" text,
    "handoffMessage" text,
    "maxHistory" integer DEFAULT 12 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "queueId" integer,
    "whatsappId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    persona json,
    "maxTokens" integer DEFAULT 350 NOT NULL,
    "dailyTokenCap" integer DEFAULT 300000 NOT NULL,
    "handoffAfterTurns" integer DEFAULT 14 NOT NULL,
    "waitSeconds" integer DEFAULT 4 NOT NULL,
    slots json,
    "reviewNumber" character varying(255),
    "reviewWhatsappId" integer,
    "learnFromTeam" boolean DEFAULT true NOT NULL
);


--
-- Name: AiAgents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AiAgents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AiAgents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AiAgents_id_seq" OWNED BY public."AiAgents".id;


--
-- Name: AiLearnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AiLearnings" (
    id integer NOT NULL,
    "agentId" integer NOT NULL,
    "ticketId" integer,
    "contactName" character varying(255),
    question text NOT NULL,
    "suggestedAnswer" text,
    status character varying(255) DEFAULT 'aguardando_equipe'::character varying NOT NULL,
    "answerSource" character varying(255),
    "documentId" integer,
    "reviewedAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: AiLearnings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AiLearnings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AiLearnings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AiLearnings_id_seq" OWNED BY public."AiLearnings".id;


--
-- Name: AiUsage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AiUsage" (
    id integer NOT NULL,
    "agentId" integer,
    "ticketId" integer,
    model character varying(255) NOT NULL,
    kind character varying(255) DEFAULT 'reply'::character varying NOT NULL,
    "inputTokens" integer DEFAULT 0 NOT NULL,
    "outputTokens" integer DEFAULT 0 NOT NULL,
    "cacheReadTokens" integer DEFAULT 0 NOT NULL,
    "cacheWriteTokens" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: AiUsage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AiUsage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AiUsage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AiUsage_id_seq" OWNED BY public."AiUsage".id;


--
-- Name: ApiTokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ApiTokens" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    token character varying(255) NOT NULL,
    "lastUsedAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ApiTokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ApiTokens_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ApiTokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ApiTokens_id_seq" OWNED BY public."ApiTokens".id;


--
-- Name: CampaignShippings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignShippings" (
    id integer NOT NULL,
    name character varying(255),
    number character varying(255) NOT NULL,
    message text,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    error text,
    "sentAt" timestamp with time zone,
    "campaignId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "stepsDone" integer DEFAULT 0 NOT NULL
);


--
-- Name: CampaignShippings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CampaignShippings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CampaignShippings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CampaignShippings_id_seq" OWNED BY public."CampaignShippings".id;


--
-- Name: Campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Campaigns" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'draft'::character varying NOT NULL,
    message text NOT NULL,
    "mediaUrl" character varying(255),
    "scheduledAt" timestamp with time zone,
    "startedAt" timestamp with time zone,
    "finishedAt" timestamp with time zone,
    "intervalMin" integer DEFAULT 20 NOT NULL,
    "intervalMax" integer DEFAULT 60 NOT NULL,
    "batchSize" integer DEFAULT 20 NOT NULL,
    "batchPause" integer DEFAULT 300 NOT NULL,
    "contactListId" integer NOT NULL,
    "whatsappId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "templateName" character varying(255),
    "templateLanguage" character varying(255),
    "pauseReason" character varying(255),
    steps json,
    "nextRunAt" timestamp with time zone,
    "sentInBatch" integer DEFAULT 0 NOT NULL
);


--
-- Name: Campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Campaigns_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Campaigns_id_seq" OWNED BY public."Campaigns".id;


--
-- Name: ChatbotNodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatbotNodes" (
    id integer NOT NULL,
    "whatsappId" integer,
    "parentId" integer,
    "position" integer DEFAULT 0 NOT NULL,
    title character varying(255) NOT NULL,
    keywords text,
    message text,
    action character varying(255) DEFAULT 'menu'::character varying NOT NULL,
    "targetId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    field character varying(255)
);


--
-- Name: ChatbotNodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ChatbotNodes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ChatbotNodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ChatbotNodes_id_seq" OWNED BY public."ChatbotNodes".id;


--
-- Name: ContactCustomFields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactCustomFields" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    value character varying(255) NOT NULL,
    "contactId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ContactCustomFields_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactCustomFields_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactCustomFields_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactCustomFields_id_seq" OWNED BY public."ContactCustomFields".id;


--
-- Name: ContactListItems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactListItems" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    number character varying(255) NOT NULL,
    email character varying(255),
    "contactListId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ContactListItems_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactListItems_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactListItems_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactListItems_id_seq" OWNED BY public."ContactListItems".id;


--
-- Name: ContactLists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactLists" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ContactLists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactLists_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactLists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactLists_id_seq" OWNED BY public."ContactLists".id;


--
-- Name: ContactTags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactTags" (
    "contactId" integer NOT NULL,
    "tagId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Contacts" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    number character varying(255),
    "profilePicUrl" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    email character varying(255) DEFAULT ''::character varying NOT NULL,
    "isGroup" boolean DEFAULT false NOT NULL,
    lid character varying(255) DEFAULT NULL::character varying,
    channel character varying(255) DEFAULT 'whatsapp'::character varying NOT NULL,
    "optOut" boolean DEFAULT false NOT NULL,
    "optOutAt" timestamp with time zone
);


--
-- Name: Contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Contacts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Contacts_id_seq" OWNED BY public."Contacts".id;


--
-- Name: Courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Courses" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    level character varying(255),
    modality character varying(255),
    "monthlyFee" numeric(10,2),
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "institutionId" integer,
    category character varying(255),
    semesters integer DEFAULT 8 NOT NULL
);


--
-- Name: Courses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Courses_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Courses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Courses_id_seq" OWNED BY public."Courses".id;


--
-- Name: Institutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Institutions" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    cnpj character varying(255),
    "logoFile" character varying(255),
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Institutions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Institutions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Institutions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Institutions_id_seq" OWNED BY public."Institutions".id;


--
-- Name: KbChunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."KbChunks" (
    id integer NOT NULL,
    "documentId" integer NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    content text NOT NULL,
    "contentNorm" text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, "contentNorm")) STORED
);


--
-- Name: KbChunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."KbChunks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: KbChunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."KbChunks_id_seq" OWNED BY public."KbChunks".id;


--
-- Name: KbDocuments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."KbDocuments" (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    kind character varying(255) DEFAULT 'doc'::character varying NOT NULL,
    source character varying(255) DEFAULT 'texto'::character varying NOT NULL,
    keywords text,
    content text NOT NULL,
    "agentId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: KbDocuments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."KbDocuments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: KbDocuments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."KbDocuments_id_seq" OWNED BY public."KbDocuments".id;


--
-- Name: LeadActivities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadActivities" (
    id integer NOT NULL,
    type character varying(255) NOT NULL,
    body text,
    meta text,
    "leadId" integer NOT NULL,
    "userId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: LeadActivities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."LeadActivities_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: LeadActivities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."LeadActivities_id_seq" OWNED BY public."LeadActivities".id;


--
-- Name: LeadStages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadStages" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    color character varying(255) NOT NULL,
    type character varying(255) DEFAULT 'open'::character varying NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: LeadStages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."LeadStages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: LeadStages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."LeadStages_id_seq" OWNED BY public."LeadStages".id;


--
-- Name: LeadTags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadTags" (
    "leadId" integer NOT NULL,
    "tagId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: LeadTasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadTasks" (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    type character varying(255) DEFAULT 'ligar'::character varying NOT NULL,
    "dueAt" timestamp with time zone NOT NULL,
    "doneAt" timestamp with time zone,
    "notifiedAt" timestamp with time zone,
    "leadId" integer NOT NULL,
    "userId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: LeadTasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."LeadTasks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: LeadTasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."LeadTasks_id_seq" OWNED BY public."LeadTasks".id;


--
-- Name: Leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Leads" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(255),
    email character varying(255),
    city character varying(255),
    state character varying(255),
    modality character varying(255),
    shift character varying(255),
    "entryTerm" character varying(255),
    "educationLevel" character varying(255),
    "enemScore" integer,
    financing character varying(255),
    source character varying(255),
    channel character varying(255),
    "utmSource" character varying(255),
    "utmMedium" character varying(255),
    "utmCampaign" character varying(255),
    score integer DEFAULT 0 NOT NULL,
    "lostReason" character varying(255),
    "lostNote" text,
    "wonAt" timestamp with time zone,
    "lostAt" timestamp with time zone,
    "firstContactAt" timestamp with time zone,
    "lastContactAt" timestamp with time zone,
    "lastInboundAt" timestamp with time zone,
    "nextFollowUpAt" timestamp with time zone,
    "consentAt" timestamp with time zone,
    notes text,
    "courseId" integer,
    "stageId" integer NOT NULL,
    "ownerId" integer,
    "contactId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    cpf character varying(11),
    "admissionType" character varying(255),
    "entrySemester" integer DEFAULT 1 NOT NULL,
    "decisionTimeline" character varying(255),
    motivation character varying(255),
    "extraSemesters" integer DEFAULT 0 NOT NULL,
    "poloId" integer,
    "onboardingStatus" character varying(255) DEFAULT 'none'::character varying NOT NULL,
    "onboardingTutorId" integer,
    "enrolledAt" timestamp with time zone,
    "onboardingStartedAt" timestamp with time zone,
    "onboardingDoneAt" timestamp with time zone,
    "onboardingAlertAt" timestamp with time zone,
    "indicatedBy" integer
);


--
-- Name: Leads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Leads_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Leads_id_seq" OWNED BY public."Leads".id;


--
-- Name: Messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Messages" (
    id character varying(255) NOT NULL,
    body text NOT NULL,
    ack integer DEFAULT 0 NOT NULL,
    read boolean DEFAULT false NOT NULL,
    "mediaType" character varying(255),
    "mediaUrl" text,
    "ticketId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "fromMe" boolean DEFAULT false NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "contactId" integer,
    "quotedMsgId" character varying(255),
    starred boolean DEFAULT false NOT NULL,
    reactions text
);


--
-- Name: Payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Payments" (
    id integer NOT NULL,
    provider character varying(255) DEFAULT 'efi'::character varying NOT NULL,
    kind character varying(255) DEFAULT 'matricula'::character varying NOT NULL,
    txid character varying(255) NOT NULL,
    amount numeric(10,2) NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    description character varying(255),
    "pixCopiaECola" text,
    "qrImage" text,
    "locationUrl" text,
    "expiresAt" timestamp with time zone,
    "paidAt" timestamp with time zone,
    "paidAmount" numeric(10,2),
    "endToEndId" character varying(255),
    "lastError" text,
    "leadId" integer NOT NULL,
    "proposalId" integer,
    "createdBy" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    method character varying(255) DEFAULT 'pix'::character varying NOT NULL,
    "chargeId" character varying(255),
    "dueDate" date,
    "generateAt" timestamp with time zone,
    barcode text,
    "billetLink" text,
    "pdfLink" text,
    "recipientUserId" integer,
    "recipientCode" character varying(255),
    "splitPct" integer,
    "reminderTaskId" integer
);


--
-- Name: Payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Payments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Payments_id_seq" OWNED BY public."Payments".id;


--
-- Name: PoloMembers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PoloMembers" (
    id integer NOT NULL,
    "poloId" integer NOT NULL,
    "userId" integer NOT NULL,
    role character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: PoloMembers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."PoloMembers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PoloMembers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."PoloMembers_id_seq" OWNED BY public."PoloMembers".id;


--
-- Name: Polos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Polos" (
    id integer NOT NULL,
    code character varying(255),
    name character varying(255) NOT NULL,
    city character varying(255),
    state character varying(2),
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Polos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Polos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Polos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Polos_id_seq" OWNED BY public."Polos".id;


--
-- Name: ProposalTemplateInstitutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProposalTemplateInstitutions" (
    id integer NOT NULL,
    "templateId" integer NOT NULL,
    "institutionId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ProposalTemplateInstitutions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ProposalTemplateInstitutions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ProposalTemplateInstitutions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ProposalTemplateInstitutions_id_seq" OWNED BY public."ProposalTemplateInstitutions".id;


--
-- Name: ProposalTemplates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ProposalTemplates" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "institutionId" integer,
    "enrollmentFee" numeric(10,2) DEFAULT 0 NOT NULL,
    "dueDay" integer DEFAULT 10 NOT NULL,
    installments integer DEFAULT 6 NOT NULL,
    "punctualityPct" integer DEFAULT 25 NOT NULL,
    "lateFee1Pct" integer DEFAULT 15 NOT NULL,
    "lateFee2Pct" integer DEFAULT 25 NOT NULL,
    "annualMin" numeric(5,2) DEFAULT 5 NOT NULL,
    "annualMax" numeric(5,2) DEFAULT 11 NOT NULL,
    "semestralSchedule" text NOT NULL,
    "bolsaFirst" numeric(5,2) DEFAULT 0 NOT NULL,
    "bolsaNext" numeric(5,2) DEFAULT 0 NOT NULL,
    "bolsaNote" text,
    observation text,
    disclaimer text,
    "finalMessage" text,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "installmentsFixed" integer,
    "hasRegression" boolean DEFAULT true NOT NULL,
    "hasAdjustment" boolean DEFAULT true NOT NULL,
    "fixedUntilEnd" boolean DEFAULT false NOT NULL,
    "firstExempt" boolean DEFAULT false NOT NULL,
    "waIntro" text,
    "waClosing" text
);


--
-- Name: ProposalTemplates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ProposalTemplates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ProposalTemplates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ProposalTemplates_id_seq" OWNED BY public."ProposalTemplates".id;


--
-- Name: Proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Proposals" (
    id integer NOT NULL,
    token character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'draft'::character varying NOT NULL,
    "courseName" character varying(255),
    "grossFee" numeric(10,2) NOT NULL,
    "firstMonthly" numeric(10,2) NOT NULL,
    "bolsaPct" numeric(5,2) NOT NULL,
    params text NOT NULL,
    "sentAt" timestamp with time zone,
    "viewedAt" timestamp with time zone,
    "leadId" integer NOT NULL,
    "courseId" integer,
    "templateId" integer,
    "institutionId" integer,
    "createdBy" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Proposals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Proposals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Proposals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Proposals_id_seq" OWNED BY public."Proposals".id;


--
-- Name: Queues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Queues" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    color character varying(255) NOT NULL,
    "greetingMessage" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "autoAssign" character varying(255) DEFAULT 'none'::character varying NOT NULL,
    "poloId" integer,
    role character varying(255)
);


--
-- Name: Queues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Queues_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Queues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Queues_id_seq" OWNED BY public."Queues".id;


--
-- Name: QuickAnswers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuickAnswers" (
    id integer NOT NULL,
    shortcut text NOT NULL,
    message text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: QuickAnswers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."QuickAnswers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: QuickAnswers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."QuickAnswers_id_seq" OWNED BY public."QuickAnswers".id;


--
-- Name: Schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Schedules" (
    id integer NOT NULL,
    body text NOT NULL,
    "mediaUrl" character varying(255),
    "sendAt" timestamp with time zone NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    error text,
    "sentAt" timestamp with time zone,
    "contactId" integer NOT NULL,
    "ticketId" integer,
    "whatsappId" integer,
    "userId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Schedules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Schedules_id_seq" OWNED BY public."Schedules".id;


--
-- Name: SequelizeMeta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SequelizeMeta" (
    name character varying(255) NOT NULL
);


--
-- Name: Settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Settings" (
    key character varying(255) NOT NULL,
    value text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tags" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    color character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Tags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Tags_id_seq" OWNED BY public."Tags".id;


--
-- Name: TicketEvents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TicketEvents" (
    id integer NOT NULL,
    "ticketId" integer NOT NULL,
    type character varying(255) NOT NULL,
    "actorId" integer,
    "fromQueueId" integer,
    "toQueueId" integer,
    "fromUserId" integer,
    "toUserId" integer,
    note text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: TicketEvents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."TicketEvents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: TicketEvents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."TicketEvents_id_seq" OWNED BY public."TicketEvents".id;


--
-- Name: TicketPins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TicketPins" (
    "userId" integer NOT NULL,
    "ticketId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: TicketTags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TicketTags" (
    "ticketId" integer NOT NULL,
    "tagId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tickets" (
    id integer NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    "lastMessage" text,
    "contactId" integer,
    "userId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "whatsappId" integer,
    "isGroup" boolean DEFAULT false NOT NULL,
    "unreadMessages" integer,
    "queueId" integer,
    "closedAt" timestamp with time zone,
    "firstResponseAt" timestamp with time zone,
    "chatbotNodeId" integer,
    "aiActive" boolean DEFAULT true NOT NULL,
    "outOfHoursSentAt" timestamp with time zone,
    segment character varying(255) DEFAULT 'sales'::character varying NOT NULL,
    "leadId" integer,
    "archivedAt" timestamp with time zone,
    "aiSummary" text,
    "aiTurns" integer DEFAULT 0 NOT NULL,
    "aiSlots" json,
    "botReminderAt" timestamp with time zone
);


--
-- Name: Tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Tickets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Tickets_id_seq" OWNED BY public."Tickets".id;


--
-- Name: UserQueues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserQueues" (
    "userId" integer NOT NULL,
    "queueId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Users" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    "passwordHash" character varying(255) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    profile character varying(255) DEFAULT 'admin'::character varying NOT NULL,
    "tokenVersion" integer DEFAULT 0 NOT NULL,
    "whatsappId" integer,
    role character varying(255) DEFAULT 'consultor'::character varying NOT NULL,
    "efiPayeeCode" character varying(255)
);


--
-- Name: Users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Users_id_seq" OWNED BY public."Users".id;


--
-- Name: Webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Webhooks" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    url text NOT NULL,
    secret character varying(255),
    events text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "lastStatus" integer,
    "lastError" text,
    "lastAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Webhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Webhooks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Webhooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Webhooks_id_seq" OWNED BY public."Webhooks".id;


--
-- Name: WhatsappQueues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WhatsappQueues" (
    "whatsappId" integer NOT NULL,
    "queueId" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Whatsapps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Whatsapps" (
    id integer NOT NULL,
    session text,
    qrcode text,
    status character varying(255),
    battery character varying(255),
    plugged boolean,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    name character varying(255) NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    retries integer DEFAULT 0 NOT NULL,
    "greetingMessage" text,
    "farewellMessage" text,
    channel character varying(255) DEFAULT 'whatsapp'::character varying NOT NULL,
    config text,
    "businessHours" text,
    "outOfHoursMessage" text,
    "riskMode" character varying(255) DEFAULT 'strict'::character varying NOT NULL,
    "connectedSince" timestamp with time zone,
    "groupsMode" character varying(255) DEFAULT 'off'::character varying NOT NULL,
    "allowedGroups" text,
    "ownerId" integer
);


--
-- Name: Whatsapps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Whatsapps_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Whatsapps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Whatsapps_id_seq" OWNED BY public."Whatsapps".id;


--
-- Name: WppKeys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WppKeys" (
    id integer NOT NULL,
    "connectionId" integer NOT NULL,
    type text NOT NULL,
    "keyId" text NOT NULL,
    value text NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: WppKeys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."WppKeys_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: WppKeys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."WppKeys_id_seq" OWNED BY public."WppKeys".id;


--
-- Name: AiAgents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiAgents" ALTER COLUMN id SET DEFAULT nextval('public."AiAgents_id_seq"'::regclass);


--
-- Name: AiLearnings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiLearnings" ALTER COLUMN id SET DEFAULT nextval('public."AiLearnings_id_seq"'::regclass);


--
-- Name: AiUsage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiUsage" ALTER COLUMN id SET DEFAULT nextval('public."AiUsage_id_seq"'::regclass);


--
-- Name: ApiTokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiTokens" ALTER COLUMN id SET DEFAULT nextval('public."ApiTokens_id_seq"'::regclass);


--
-- Name: CampaignShippings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShippings" ALTER COLUMN id SET DEFAULT nextval('public."CampaignShippings_id_seq"'::regclass);


--
-- Name: Campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns" ALTER COLUMN id SET DEFAULT nextval('public."Campaigns_id_seq"'::regclass);


--
-- Name: ChatbotNodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatbotNodes" ALTER COLUMN id SET DEFAULT nextval('public."ChatbotNodes_id_seq"'::regclass);


--
-- Name: ContactCustomFields id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactCustomFields" ALTER COLUMN id SET DEFAULT nextval('public."ContactCustomFields_id_seq"'::regclass);


--
-- Name: ContactListItems id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactListItems" ALTER COLUMN id SET DEFAULT nextval('public."ContactListItems_id_seq"'::regclass);


--
-- Name: ContactLists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactLists" ALTER COLUMN id SET DEFAULT nextval('public."ContactLists_id_seq"'::regclass);


--
-- Name: Contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts" ALTER COLUMN id SET DEFAULT nextval('public."Contacts_id_seq"'::regclass);


--
-- Name: Courses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Courses" ALTER COLUMN id SET DEFAULT nextval('public."Courses_id_seq"'::regclass);


--
-- Name: Institutions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Institutions" ALTER COLUMN id SET DEFAULT nextval('public."Institutions_id_seq"'::regclass);


--
-- Name: KbChunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KbChunks" ALTER COLUMN id SET DEFAULT nextval('public."KbChunks_id_seq"'::regclass);


--
-- Name: KbDocuments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KbDocuments" ALTER COLUMN id SET DEFAULT nextval('public."KbDocuments_id_seq"'::regclass);


--
-- Name: LeadActivities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadActivities" ALTER COLUMN id SET DEFAULT nextval('public."LeadActivities_id_seq"'::regclass);


--
-- Name: LeadStages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadStages" ALTER COLUMN id SET DEFAULT nextval('public."LeadStages_id_seq"'::regclass);


--
-- Name: LeadTasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadTasks" ALTER COLUMN id SET DEFAULT nextval('public."LeadTasks_id_seq"'::regclass);


--
-- Name: Leads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leads" ALTER COLUMN id SET DEFAULT nextval('public."Leads_id_seq"'::regclass);


--
-- Name: Payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments" ALTER COLUMN id SET DEFAULT nextval('public."Payments_id_seq"'::regclass);


--
-- Name: PoloMembers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PoloMembers" ALTER COLUMN id SET DEFAULT nextval('public."PoloMembers_id_seq"'::regclass);


--
-- Name: Polos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Polos" ALTER COLUMN id SET DEFAULT nextval('public."Polos_id_seq"'::regclass);


--
-- Name: ProposalTemplateInstitutions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalTemplateInstitutions" ALTER COLUMN id SET DEFAULT nextval('public."ProposalTemplateInstitutions_id_seq"'::regclass);


--
-- Name: ProposalTemplates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalTemplates" ALTER COLUMN id SET DEFAULT nextval('public."ProposalTemplates_id_seq"'::regclass);


--
-- Name: Proposals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proposals" ALTER COLUMN id SET DEFAULT nextval('public."Proposals_id_seq"'::regclass);


--
-- Name: Queues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues" ALTER COLUMN id SET DEFAULT nextval('public."Queues_id_seq"'::regclass);


--
-- Name: QuickAnswers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuickAnswers" ALTER COLUMN id SET DEFAULT nextval('public."QuickAnswers_id_seq"'::regclass);


--
-- Name: Schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules" ALTER COLUMN id SET DEFAULT nextval('public."Schedules_id_seq"'::regclass);


--
-- Name: Tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tags" ALTER COLUMN id SET DEFAULT nextval('public."Tags_id_seq"'::regclass);


--
-- Name: TicketEvents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketEvents" ALTER COLUMN id SET DEFAULT nextval('public."TicketEvents_id_seq"'::regclass);


--
-- Name: Tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets" ALTER COLUMN id SET DEFAULT nextval('public."Tickets_id_seq"'::regclass);


--
-- Name: Users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users" ALTER COLUMN id SET DEFAULT nextval('public."Users_id_seq"'::regclass);


--
-- Name: Webhooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhooks" ALTER COLUMN id SET DEFAULT nextval('public."Webhooks_id_seq"'::regclass);


--
-- Name: Whatsapps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Whatsapps" ALTER COLUMN id SET DEFAULT nextval('public."Whatsapps_id_seq"'::regclass);


--
-- Name: WppKeys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WppKeys" ALTER COLUMN id SET DEFAULT nextval('public."WppKeys_id_seq"'::regclass);


--
-- Name: AiAgents AiAgents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiAgents"
    ADD CONSTRAINT "AiAgents_pkey" PRIMARY KEY (id);


--
-- Name: AiLearnings AiLearnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiLearnings"
    ADD CONSTRAINT "AiLearnings_pkey" PRIMARY KEY (id);


--
-- Name: AiUsage AiUsage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiUsage"
    ADD CONSTRAINT "AiUsage_pkey" PRIMARY KEY (id);


--
-- Name: ApiTokens ApiTokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiTokens"
    ADD CONSTRAINT "ApiTokens_pkey" PRIMARY KEY (id);


--
-- Name: ApiTokens ApiTokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiTokens"
    ADD CONSTRAINT "ApiTokens_token_key" UNIQUE (token);


--
-- Name: CampaignShippings CampaignShippings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShippings"
    ADD CONSTRAINT "CampaignShippings_pkey" PRIMARY KEY (id);


--
-- Name: Campaigns Campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_pkey" PRIMARY KEY (id);


--
-- Name: ChatbotNodes ChatbotNodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatbotNodes"
    ADD CONSTRAINT "ChatbotNodes_pkey" PRIMARY KEY (id);


--
-- Name: ContactCustomFields ContactCustomFields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactCustomFields"
    ADD CONSTRAINT "ContactCustomFields_pkey" PRIMARY KEY (id);


--
-- Name: ContactListItems ContactListItems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactListItems"
    ADD CONSTRAINT "ContactListItems_pkey" PRIMARY KEY (id);


--
-- Name: ContactLists ContactLists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactLists"
    ADD CONSTRAINT "ContactLists_pkey" PRIMARY KEY (id);


--
-- Name: ContactTags ContactTags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTags"
    ADD CONSTRAINT "ContactTags_pkey" PRIMARY KEY ("contactId", "tagId");


--
-- Name: Contacts Contacts_lid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts"
    ADD CONSTRAINT "Contacts_lid_key" UNIQUE (lid);


--
-- Name: Contacts Contacts_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts"
    ADD CONSTRAINT "Contacts_number_key" UNIQUE (number);


--
-- Name: Contacts Contacts_number_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts"
    ADD CONSTRAINT "Contacts_number_key1" UNIQUE (number);


--
-- Name: Contacts Contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts"
    ADD CONSTRAINT "Contacts_pkey" PRIMARY KEY (id);


--
-- Name: Courses Courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Courses"
    ADD CONSTRAINT "Courses_pkey" PRIMARY KEY (id);


--
-- Name: Institutions Institutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Institutions"
    ADD CONSTRAINT "Institutions_pkey" PRIMARY KEY (id);


--
-- Name: KbChunks KbChunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KbChunks"
    ADD CONSTRAINT "KbChunks_pkey" PRIMARY KEY (id);


--
-- Name: KbDocuments KbDocuments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KbDocuments"
    ADD CONSTRAINT "KbDocuments_pkey" PRIMARY KEY (id);


--
-- Name: LeadActivities LeadActivities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadActivities"
    ADD CONSTRAINT "LeadActivities_pkey" PRIMARY KEY (id);


--
-- Name: LeadStages LeadStages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadStages"
    ADD CONSTRAINT "LeadStages_pkey" PRIMARY KEY (id);


--
-- Name: LeadTags LeadTags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadTags"
    ADD CONSTRAINT "LeadTags_pkey" PRIMARY KEY ("leadId", "tagId");


--
-- Name: LeadTasks LeadTasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadTasks"
    ADD CONSTRAINT "LeadTasks_pkey" PRIMARY KEY (id);


--
-- Name: Leads Leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leads"
    ADD CONSTRAINT "Leads_pkey" PRIMARY KEY (id);


--
-- Name: Messages Messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_pkey" PRIMARY KEY (id);


--
-- Name: Payments Payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments"
    ADD CONSTRAINT "Payments_pkey" PRIMARY KEY (id);


--
-- Name: Payments Payments_txid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments"
    ADD CONSTRAINT "Payments_txid_key" UNIQUE (txid);


--
-- Name: PoloMembers PoloMembers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PoloMembers"
    ADD CONSTRAINT "PoloMembers_pkey" PRIMARY KEY (id);


--
-- Name: Polos Polos_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Polos"
    ADD CONSTRAINT "Polos_code_key" UNIQUE (code);


--
-- Name: Polos Polos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Polos"
    ADD CONSTRAINT "Polos_pkey" PRIMARY KEY (id);


--
-- Name: ProposalTemplateInstitutions ProposalTemplateInstitutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalTemplateInstitutions"
    ADD CONSTRAINT "ProposalTemplateInstitutions_pkey" PRIMARY KEY (id);


--
-- Name: ProposalTemplates ProposalTemplates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalTemplates"
    ADD CONSTRAINT "ProposalTemplates_pkey" PRIMARY KEY (id);


--
-- Name: Proposals Proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proposals"
    ADD CONSTRAINT "Proposals_pkey" PRIMARY KEY (id);


--
-- Name: Proposals Proposals_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proposals"
    ADD CONSTRAINT "Proposals_token_key" UNIQUE (token);


--
-- Name: Queues Queues_color_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT "Queues_color_key" UNIQUE (color);


--
-- Name: Queues Queues_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT "Queues_name_key" UNIQUE (name);


--
-- Name: Queues Queues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT "Queues_pkey" PRIMARY KEY (id);


--
-- Name: QuickAnswers QuickAnswers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuickAnswers"
    ADD CONSTRAINT "QuickAnswers_pkey" PRIMARY KEY (id);


--
-- Name: Schedules Schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_pkey" PRIMARY KEY (id);


--
-- Name: SequelizeMeta SequelizeMeta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SequelizeMeta"
    ADD CONSTRAINT "SequelizeMeta_pkey" PRIMARY KEY (name);


--
-- Name: Settings Settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Settings"
    ADD CONSTRAINT "Settings_pkey" PRIMARY KEY (key);


--
-- Name: Tags Tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tags"
    ADD CONSTRAINT "Tags_name_key" UNIQUE (name);


--
-- Name: Tags Tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tags"
    ADD CONSTRAINT "Tags_pkey" PRIMARY KEY (id);


--
-- Name: TicketEvents TicketEvents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketEvents"
    ADD CONSTRAINT "TicketEvents_pkey" PRIMARY KEY (id);


--
-- Name: TicketPins TicketPins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketPins"
    ADD CONSTRAINT "TicketPins_pkey" PRIMARY KEY ("userId", "ticketId");


--
-- Name: TicketTags TicketTags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTags"
    ADD CONSTRAINT "TicketTags_pkey" PRIMARY KEY ("ticketId", "tagId");


--
-- Name: Tickets Tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_pkey" PRIMARY KEY (id);


--
-- Name: UserQueues UserQueues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserQueues"
    ADD CONSTRAINT "UserQueues_pkey" PRIMARY KEY ("userId", "queueId");


--
-- Name: Users Users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_email_key" UNIQUE (email);


--
-- Name: Users Users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_pkey" PRIMARY KEY (id);


--
-- Name: Webhooks Webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhooks"
    ADD CONSTRAINT "Webhooks_pkey" PRIMARY KEY (id);


--
-- Name: WhatsappQueues WhatsappQueues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsappQueues"
    ADD CONSTRAINT "WhatsappQueues_pkey" PRIMARY KEY ("whatsappId", "queueId");


--
-- Name: Whatsapps Whatsapps_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Whatsapps"
    ADD CONSTRAINT "Whatsapps_name_key" UNIQUE (name);


--
-- Name: Whatsapps Whatsapps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Whatsapps"
    ADD CONSTRAINT "Whatsapps_pkey" PRIMARY KEY (id);


--
-- Name: WppKeys WppKeys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WppKeys"
    ADD CONSTRAINT "WppKeys_pkey" PRIMARY KEY (id);


--
-- Name: ai_learnings_agent_id_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_learnings_agent_id_status ON public."AiLearnings" USING btree ("agentId", status);


--
-- Name: ai_learnings_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_learnings_ticket_id ON public."AiLearnings" USING btree ("ticketId");


--
-- Name: ai_usage_agent_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_agent_id_created_at ON public."AiUsage" USING btree ("agentId", "createdAt");


--
-- Name: kb_chunks_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kb_chunks_document_id ON public."KbChunks" USING btree ("documentId");


--
-- Name: kb_chunks_tsv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kb_chunks_tsv_idx ON public."KbChunks" USING gin (tsv);


--
-- Name: leads_cpf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_cpf ON public."Leads" USING btree (cpf);


--
-- Name: leads_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_email ON public."Leads" USING btree (email);


--
-- Name: leads_onboarding_tutor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_onboarding_tutor_id ON public."Leads" USING btree ("onboardingTutorId");


--
-- Name: leads_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_owner_id ON public."Leads" USING btree ("ownerId");


--
-- Name: leads_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_phone ON public."Leads" USING btree (phone);


--
-- Name: leads_stage_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_stage_id ON public."Leads" USING btree ("stageId");


--
-- Name: payments_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_lead_id ON public."Payments" USING btree ("leadId");


--
-- Name: payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_status ON public."Payments" USING btree (status);


--
-- Name: polo_members_polo_id_user_id_role; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX polo_members_polo_id_user_id_role ON public."PoloMembers" USING btree ("poloId", "userId", role);


--
-- Name: proposal_template_institutions_template_id_institution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX proposal_template_institutions_template_id_institution_id ON public."ProposalTemplateInstitutions" USING btree ("templateId", "institutionId");


--
-- Name: ticket_events_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_events_ticket_id ON public."TicketEvents" USING btree ("ticketId");


--
-- Name: tickets_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_lead_id ON public."Tickets" USING btree ("leadId");


--
-- Name: wpp_keys_connection_type_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wpp_keys_connection_type_key_unique ON public."WppKeys" USING btree ("connectionId", type, "keyId");


--
-- Name: AiAgents AiAgents_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiAgents"
    ADD CONSTRAINT "AiAgents_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: AiAgents AiAgents_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiAgents"
    ADD CONSTRAINT "AiAgents_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE SET NULL;


--
-- Name: AiLearnings AiLearnings_agentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiLearnings"
    ADD CONSTRAINT "AiLearnings_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES public."AiAgents"(id) ON DELETE CASCADE;


--
-- Name: CampaignShippings CampaignShippings_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShippings"
    ADD CONSTRAINT "CampaignShippings_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."Campaigns"(id) ON DELETE CASCADE;


--
-- Name: Campaigns Campaigns_contactListId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_contactListId_fkey" FOREIGN KEY ("contactListId") REFERENCES public."ContactLists"(id) ON DELETE CASCADE;


--
-- Name: Campaigns Campaigns_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE SET NULL;


--
-- Name: ChatbotNodes ChatbotNodes_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatbotNodes"
    ADD CONSTRAINT "ChatbotNodes_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE CASCADE;


--
-- Name: ContactCustomFields ContactCustomFields_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactCustomFields"
    ADD CONSTRAINT "ContactCustomFields_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContactListItems ContactListItems_contactListId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactListItems"
    ADD CONSTRAINT "ContactListItems_contactListId_fkey" FOREIGN KEY ("contactListId") REFERENCES public."ContactLists"(id) ON DELETE CASCADE;


--
-- Name: ContactTags ContactTags_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTags"
    ADD CONSTRAINT "ContactTags_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: ContactTags ContactTags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTags"
    ADD CONSTRAINT "ContactTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."Tags"(id) ON DELETE CASCADE;


--
-- Name: Courses Courses_institutionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Courses"
    ADD CONSTRAINT "Courses_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES public."Institutions"(id) ON DELETE SET NULL;


--
-- Name: KbChunks KbChunks_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KbChunks"
    ADD CONSTRAINT "KbChunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."KbDocuments"(id) ON DELETE CASCADE;


--
-- Name: KbDocuments KbDocuments_agentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KbDocuments"
    ADD CONSTRAINT "KbDocuments_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES public."AiAgents"(id) ON DELETE CASCADE;


--
-- Name: LeadActivities LeadActivities_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadActivities"
    ADD CONSTRAINT "LeadActivities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Leads"(id) ON DELETE CASCADE;


--
-- Name: LeadActivities LeadActivities_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadActivities"
    ADD CONSTRAINT "LeadActivities_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: LeadTags LeadTags_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadTags"
    ADD CONSTRAINT "LeadTags_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Leads"(id) ON DELETE CASCADE;


--
-- Name: LeadTags LeadTags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadTags"
    ADD CONSTRAINT "LeadTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."Tags"(id) ON DELETE CASCADE;


--
-- Name: LeadTasks LeadTasks_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadTasks"
    ADD CONSTRAINT "LeadTasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Leads"(id) ON DELETE CASCADE;


--
-- Name: LeadTasks LeadTasks_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadTasks"
    ADD CONSTRAINT "LeadTasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Leads Leads_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leads"
    ADD CONSTRAINT "Leads_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE SET NULL;


--
-- Name: Leads Leads_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leads"
    ADD CONSTRAINT "Leads_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES public."Courses"(id) ON DELETE SET NULL;


--
-- Name: Leads Leads_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leads"
    ADD CONSTRAINT "Leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Leads Leads_poloId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leads"
    ADD CONSTRAINT "Leads_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES public."Polos"(id) ON DELETE SET NULL;


--
-- Name: Leads Leads_stageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leads"
    ADD CONSTRAINT "Leads_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES public."LeadStages"(id) ON DELETE RESTRICT;


--
-- Name: Messages Messages_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Messages Messages_quotedMsgId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_quotedMsgId_fkey" FOREIGN KEY ("quotedMsgId") REFERENCES public."Messages"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Messages Messages_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Payments Payments_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments"
    ADD CONSTRAINT "Payments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Payments Payments_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments"
    ADD CONSTRAINT "Payments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Leads"(id) ON DELETE CASCADE;


--
-- Name: Payments Payments_proposalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payments"
    ADD CONSTRAINT "Payments_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES public."Proposals"(id) ON DELETE SET NULL;


--
-- Name: PoloMembers PoloMembers_poloId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PoloMembers"
    ADD CONSTRAINT "PoloMembers_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES public."Polos"(id) ON DELETE CASCADE;


--
-- Name: PoloMembers PoloMembers_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PoloMembers"
    ADD CONSTRAINT "PoloMembers_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: ProposalTemplateInstitutions ProposalTemplateInstitutions_institutionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalTemplateInstitutions"
    ADD CONSTRAINT "ProposalTemplateInstitutions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES public."Institutions"(id) ON DELETE CASCADE;


--
-- Name: ProposalTemplateInstitutions ProposalTemplateInstitutions_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalTemplateInstitutions"
    ADD CONSTRAINT "ProposalTemplateInstitutions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."ProposalTemplates"(id) ON DELETE CASCADE;


--
-- Name: ProposalTemplates ProposalTemplates_institutionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ProposalTemplates"
    ADD CONSTRAINT "ProposalTemplates_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES public."Institutions"(id) ON DELETE SET NULL;


--
-- Name: Proposals Proposals_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proposals"
    ADD CONSTRAINT "Proposals_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES public."Courses"(id) ON DELETE SET NULL;


--
-- Name: Proposals Proposals_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proposals"
    ADD CONSTRAINT "Proposals_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Proposals Proposals_institutionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proposals"
    ADD CONSTRAINT "Proposals_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES public."Institutions"(id) ON DELETE SET NULL;


--
-- Name: Proposals Proposals_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proposals"
    ADD CONSTRAINT "Proposals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Leads"(id) ON DELETE CASCADE;


--
-- Name: Proposals Proposals_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proposals"
    ADD CONSTRAINT "Proposals_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."ProposalTemplates"(id) ON DELETE SET NULL;


--
-- Name: Queues Queues_poloId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT "Queues_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES public."Polos"(id) ON DELETE SET NULL;


--
-- Name: Schedules Schedules_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: Schedules Schedules_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE SET NULL;


--
-- Name: Schedules Schedules_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Schedules Schedules_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE SET NULL;


--
-- Name: TicketEvents TicketEvents_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketEvents"
    ADD CONSTRAINT "TicketEvents_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: TicketPins TicketPins_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketPins"
    ADD CONSTRAINT "TicketPins_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: TicketPins TicketPins_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketPins"
    ADD CONSTRAINT "TicketPins_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: TicketTags TicketTags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTags"
    ADD CONSTRAINT "TicketTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."Tags"(id) ON DELETE CASCADE;


--
-- Name: TicketTags TicketTags_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTags"
    ADD CONSTRAINT "TicketTags_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: Tickets Tickets_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Tickets Tickets_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Tickets Tickets_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Tickets Tickets_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Users Users_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Whatsapps Whatsapps_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Whatsapps"
    ADD CONSTRAINT "Whatsapps_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WppKeys WppKeys_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WppKeys"
    ADD CONSTRAINT "WppKeys_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AiAgents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AiAgents" ENABLE ROW LEVEL SECURITY;

--
-- Name: ApiTokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ApiTokens" ENABLE ROW LEVEL SECURITY;

--
-- Name: CampaignShippings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CampaignShippings" ENABLE ROW LEVEL SECURITY;

--
-- Name: Campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Campaigns" ENABLE ROW LEVEL SECURITY;

--
-- Name: ChatbotNodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ChatbotNodes" ENABLE ROW LEVEL SECURITY;

--
-- Name: ContactCustomFields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ContactCustomFields" ENABLE ROW LEVEL SECURITY;

--
-- Name: ContactListItems; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ContactListItems" ENABLE ROW LEVEL SECURITY;

--
-- Name: ContactLists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ContactLists" ENABLE ROW LEVEL SECURITY;

--
-- Name: ContactTags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ContactTags" ENABLE ROW LEVEL SECURITY;

--
-- Name: Contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Contacts" ENABLE ROW LEVEL SECURITY;

--
-- Name: Courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Courses" ENABLE ROW LEVEL SECURITY;

--
-- Name: Institutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Institutions" ENABLE ROW LEVEL SECURITY;

--
-- Name: LeadActivities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LeadActivities" ENABLE ROW LEVEL SECURITY;

--
-- Name: LeadStages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LeadStages" ENABLE ROW LEVEL SECURITY;

--
-- Name: LeadTags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LeadTags" ENABLE ROW LEVEL SECURITY;

--
-- Name: LeadTasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LeadTasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: Leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Leads" ENABLE ROW LEVEL SECURITY;

--
-- Name: Messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: Payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProposalTemplates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ProposalTemplates" ENABLE ROW LEVEL SECURITY;

--
-- Name: Proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Proposals" ENABLE ROW LEVEL SECURITY;

--
-- Name: Queues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Queues" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuickAnswers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."QuickAnswers" ENABLE ROW LEVEL SECURITY;

--
-- Name: Schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Schedules" ENABLE ROW LEVEL SECURITY;

--
-- Name: SequelizeMeta; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SequelizeMeta" ENABLE ROW LEVEL SECURITY;

--
-- Name: Settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: Tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: TicketEvents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TicketEvents" ENABLE ROW LEVEL SECURITY;

--
-- Name: TicketTags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TicketTags" ENABLE ROW LEVEL SECURITY;

--
-- Name: Tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Tickets" ENABLE ROW LEVEL SECURITY;

--
-- Name: UserQueues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."UserQueues" ENABLE ROW LEVEL SECURITY;

--
-- Name: Users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Users" ENABLE ROW LEVEL SECURITY;

--
-- Name: Webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Webhooks" ENABLE ROW LEVEL SECURITY;

--
-- Name: WhatsappQueues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WhatsappQueues" ENABLE ROW LEVEL SECURITY;

--
-- Name: Whatsapps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Whatsapps" ENABLE ROW LEVEL SECURITY;

--
-- Name: WppKeys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WppKeys" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



-- Migrations já aplicadas (assim o `npm run db:migrate` não tenta criar de novo)
SET search_path TO public;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200717133438-create-users.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200717144403-create-contacts.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200717145643-create-tickets.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200717151645-create-messages.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200717170223-create-whatsapps.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200723200315-create-contacts-custom-fields.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200723202116-add-email-field-to-contacts.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200730153237-remove-user-association-from-messages.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200730153545-add-fromMe-to-messages.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200813114236-change-ticket-lastMessage-column-type.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200901235509-add-profile-column-to-users.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200903215941-create-settings.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200904220257-add-name-to-whatsapp.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200906122228-add-name-default-field-to-whatsapp.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200906155658-add-whatsapp-field-to-tickets.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200919124112-update-default-column-name-on-whatsappp.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200927220708-add-isDeleted-column-to-messages.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200929145451-add-user-tokenVersion-column.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200930162323-add-isGroup-column-to-tickets.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20200930194808-add-isGroup-column-to-contacts.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20201004150008-add-contactId-column-to-messages.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20201004155719-add-vcardContactId-column-to-messages.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20201004955719-remove-vcardContactId-column-to-messages.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20201026215410-add-retries-to-whatsapps.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20201028124427-add-quoted-msg-to-messages.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20210108001431-add-unreadMessages-to-tickets.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20210108164404-create-queues.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20210108164504-add-queueId-to-tickets.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20210108174594-associate-whatsapp-queue.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20210108204708-associate-users-queue.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20210109192513-add-greetingMessage-to-whatsapp.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20210818102605-create-quickAnswers.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20211016014719-add-farewellMessage-to-whatsapp.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20220223095932-add-whatsapp-to-user.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20241202230000-create-wpp-keys.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20241203000000-add-lid-to-contacts.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20241203000001-allow-null-number-in-contacts.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261013000001-channels-foundation.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261013000002-create-tags.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261013000003-create-api-webhooks-schedules.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261013000004-create-campaigns.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261013000005-create-chatbot-ai.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261014000001-create-crm.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261015000001-create-proposals.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261016000001-crm-admission-cpf-payments.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261017000001-lead-decision-and-extra-semesters.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261018000001-ticket-events-and-hardening.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261018000002-send-safety.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261019000001-utc-and-app-settings.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261019000002-row-level-security.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261020000001-roles-and-polos.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261021000001-message-star-reactions.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261021000002-groups-mode.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261022000001-proposal-rules.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261023000001-efi-bolix-payee.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261024000001-enrollment-onboarding.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261025000001-campaign-steps.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261026000001-ticket-pin-archive.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261027000001-ai-v2.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261028000001-ai-learning.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261029000001-whatsapp-owner.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261030000001-long-urls.js') ON CONFLICT DO NOTHING;

-- Row Level Security: o Supabase publica as tabelas do schema public pela API REST (chave anon).
-- Todo o acesso passa pelo backend (conexão direta ao Postgres), então fechamos tudo.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
  END IF;
END $$;
