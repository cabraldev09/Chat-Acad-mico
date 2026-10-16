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
-- Name: AcademicAnalyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AcademicAnalyses" (
    id integer NOT NULL,
    "userId" integer,
    "studentId" integer,
    "leadId" integer,
    "contactId" integer,
    origin character varying(20) DEFAULT 'STAFF_UPLOAD'::character varying NOT NULL,
    "originalName" character varying(255),
    "fileHash" character varying(64),
    "contentHash" character varying(64),
    "factsHash" character varying(64),
    "documentType" character varying(40),
    rgm character varying(40),
    "studentName" character varying(160),
    "courseName" character varying(200),
    "currentPeriod" integer,
    "currentPeriodConfirmed" boolean DEFAULT false NOT NULL,
    status character varying(30),
    version integer DEFAULT 1 NOT NULL,
    "isCurrent" boolean DEFAULT true NOT NULL,
    "changeSummary" text,
    snapshot text NOT NULL,
    forecast text,
    message text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: AcademicAnalyses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AcademicAnalyses_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AcademicAnalyses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AcademicAnalyses_id_seq" OWNED BY public."AcademicAnalyses".id;


--
-- Name: AffiliateAudiences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AffiliateAudiences" (
    id integer NOT NULL,
    "targetType" character varying(255) NOT NULL,
    "targetId" integer NOT NULL,
    "ownerId" integer,
    "affiliateId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: AffiliateAudiences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AffiliateAudiences_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AffiliateAudiences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AffiliateAudiences_id_seq" OWNED BY public."AffiliateAudiences".id;


--
-- Name: AffiliateBonuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AffiliateBonuses" (
    id integer NOT NULL,
    "affiliateId" integer NOT NULL,
    "leadId" integer NOT NULL,
    "campaignId" integer,
    kind character varying(255) DEFAULT 'bonus'::character varying NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying NOT NULL,
    reason character varying(255),
    "approvedBy" integer,
    "approvedAt" timestamp with time zone,
    "paidBy" integer,
    "paidAt" timestamp with time zone,
    "paymentRef" character varying(255),
    note text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "dueAt" date
);


--
-- Name: AffiliateBonuses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AffiliateBonuses_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AffiliateBonuses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AffiliateBonuses_id_seq" OWNED BY public."AffiliateBonuses".id;


--
-- Name: AffiliateCampaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AffiliateCampaigns" (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    "coverFile" character varying(255),
    "startsAt" timestamp with time zone,
    "endsAt" timestamp with time zone,
    audience character varying(255) DEFAULT 'all'::character varying NOT NULL,
    "bonusValue" numeric(10,2),
    active boolean DEFAULT true NOT NULL,
    "createdBy" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: AffiliateCampaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AffiliateCampaigns_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AffiliateCampaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AffiliateCampaigns_id_seq" OWNED BY public."AffiliateCampaigns".id;


--
-- Name: AffiliateMaterials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AffiliateMaterials" (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    kind character varying(255) DEFAULT 'other'::character varying NOT NULL,
    description text,
    "fileName" character varying(255),
    "originalName" character varying(255),
    "mimeType" character varying(255),
    "fileSize" integer,
    "externalUrl" text,
    "copyText" text,
    "courseId" integer,
    "campaignId" integer,
    audience character varying(255) DEFAULT 'all'::character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    downloads integer DEFAULT 0 NOT NULL,
    "createdBy" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    collection character varying(255),
    copies integer DEFAULT 0 NOT NULL
);


--
-- Name: AffiliateMaterials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AffiliateMaterials_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AffiliateMaterials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AffiliateMaterials_id_seq" OWNED BY public."AffiliateMaterials".id;


--
-- Name: Affiliates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Affiliates" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(255),
    email character varying(255),
    document character varying(255),
    city character varying(255),
    "ownerId" integer,
    "poloId" integer,
    "refCode" character varying(255) NOT NULL,
    "portalToken" character varying(255) NOT NULL,
    "pixKeyType" character varying(255),
    "pixKey" character varying(255),
    status character varying(255) DEFAULT 'active'::character varying NOT NULL,
    notes text,
    "bonusValue" numeric(10,2),
    "lastAccessAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "externalLink" text
);


--
-- Name: Affiliates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Affiliates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Affiliates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Affiliates_id_seq" OWNED BY public."Affiliates".id;


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
    "learnFromTeam" boolean DEFAULT true NOT NULL,
    functions json
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
-- Name: AutomationTriggers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AutomationTriggers" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    event character varying(255) NOT NULL,
    config text DEFAULT '{}'::text NOT NULL,
    "flowId" integer,
    "runCount" integer DEFAULT 0 NOT NULL,
    "lastRunAt" timestamp with time zone,
    "createdBy" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: AutomationTriggers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AutomationTriggers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AutomationTriggers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AutomationTriggers_id_seq" OWNED BY public."AutomationTriggers".id;


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
-- Name: ChatFlowRuns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatFlowRuns" (
    id integer NOT NULL,
    "flowId" integer NOT NULL,
    "ticketId" integer,
    "contactId" integer,
    version integer DEFAULT 1 NOT NULL,
    "nodeId" character varying(255),
    status character varying(255) DEFAULT 'waiting'::character varying NOT NULL,
    vars text DEFAULT '{}'::text NOT NULL,
    tries integer DEFAULT 0 NOT NULL,
    "resumeAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ChatFlowRuns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ChatFlowRuns_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ChatFlowRuns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ChatFlowRuns_id_seq" OWNED BY public."ChatFlowRuns".id;


--
-- Name: ChatFlowStats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatFlowStats" (
    id integer NOT NULL,
    "flowId" integer NOT NULL,
    "nodeId" character varying(255) NOT NULL,
    entered integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ChatFlowStats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ChatFlowStats_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ChatFlowStats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ChatFlowStats_id_seq" OWNED BY public."ChatFlowStats".id;


--
-- Name: ChatFlows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatFlows" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description character varying(255),
    "whatsappId" integer,
    status character varying(255) DEFAULT 'draft'::character varying NOT NULL,
    entry text DEFAULT '{"type":"first_message"}'::text NOT NULL,
    draft text DEFAULT '{"nodes":[],"edges":[]}'::text NOT NULL,
    published text,
    version integer DEFAULT 0 NOT NULL,
    "publishedAt" timestamp with time zone,
    "createdBy" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ChatFlows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ChatFlows_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ChatFlows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ChatFlows_id_seq" OWNED BY public."ChatFlows".id;


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
-- Name: ClientErrors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ClientErrors" (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    "userId" integer,
    role character varying(30),
    route character varying(200),
    message text,
    stack text,
    components text,
    "userAgent" character varying(300),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    build character varying(20),
    "resolvedAt" timestamp with time zone
);


--
-- Name: ClientErrors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ClientErrors_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ClientErrors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ClientErrors_id_seq" OWNED BY public."ClientErrors".id;


--
-- Name: CommercialGrades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommercialGrades" (
    id integer NOT NULL,
    "courseName" character varying(200) NOT NULL,
    modality character varying(80),
    "curriculumTerm" character varying(40),
    degree character varying(80),
    "knowledgeArea" character varying(80),
    "durationSemesters" integer,
    "courseTracks" text DEFAULT '[]'::text NOT NULL,
    "internshipInfo" text,
    "hasTcc" boolean DEFAULT false NOT NULL,
    "totalInternshipHours" integer,
    "totalCourseHours" integer,
    "whatsappSummary" text,
    complete boolean DEFAULT true NOT NULL,
    "contentHash" character varying(64) NOT NULL,
    "catalogKey" character varying(64) NOT NULL,
    "originalName" character varying(255),
    "fileName" character varying(120) NOT NULL,
    "sizeBytes" integer,
    "uploadedById" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: CommercialGrades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CommercialGrades_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CommercialGrades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CommercialGrades_id_seq" OWNED BY public."CommercialGrades".id;


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
    "optOutAt" timestamp with time zone,
    "picCheckedAt" timestamp with time zone,
    "isStaff" boolean DEFAULT false NOT NULL,
    kind character varying(255) DEFAULT 'person'::character varying NOT NULL,
    "noReply" boolean DEFAULT false NOT NULL,
    "parentGroupId" character varying(255),
    "readOnly" boolean DEFAULT false NOT NULL,
    "communityRole" character varying(20),
    "communityId" character varying(255)
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
-- Name: CurricularAnalyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CurricularAnalyses" (
    id integer NOT NULL,
    "userId" integer,
    "leadId" integer,
    "contactId" integer,
    "candidateName" character varying(160),
    "originalName" character varying(255),
    "fileHash" character varying(64),
    "pageCount" integer,
    status character varying(20) DEFAULT 'COMPLETED'::character varying NOT NULL,
    "errorMessage" text,
    "courseName" character varying(200),
    "matrixLabel" character varying(120),
    campus character varying(120),
    modality character varying(120),
    "headerEntryPeriod" integer,
    "entryPeriod" integer,
    "entryPeriodSource" character varying(12),
    "startTerm" character varying(8),
    subjects text DEFAULT '[]'::text NOT NULL,
    claims text DEFAULT '[]'::text NOT NULL,
    "baseWarnings" text DEFAULT '[]'::text NOT NULL,
    result text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "enrollmentStatus" character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    "enrollmentNote" text,
    "enrollmentUpdatedAt" timestamp with time zone,
    "enrollmentUpdatedById" integer,
    "enrollmentReanalysisAt" timestamp with time zone,
    "followUpDueAt" timestamp with time zone,
    "followUpNotifiedAt" timestamp with time zone,
    "followUpNotificationCount" integer DEFAULT 0 NOT NULL
);


--
-- Name: CurricularAnalyses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CurricularAnalyses_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CurricularAnalyses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CurricularAnalyses_id_seq" OWNED BY public."CurricularAnalyses".id;


--
-- Name: GoalMembers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GoalMembers" (
    id integer NOT NULL,
    "goalId" integer NOT NULL,
    label character varying(255) NOT NULL,
    "userIds" text DEFAULT '[]'::text NOT NULL,
    target integer,
    "manualCount" integer DEFAULT 0 NOT NULL,
    note character varying(255),
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: GoalMembers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GoalMembers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GoalMembers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GoalMembers_id_seq" OWNED BY public."GoalMembers".id;


--
-- Name: GoalPolos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GoalPolos" (
    id integer NOT NULL,
    "goalId" integer NOT NULL,
    "poloId" integer NOT NULL,
    target integer,
    "manualCount" integer DEFAULT 0 NOT NULL,
    canceled integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    monthly text,
    "manualMonthly" text
);


--
-- Name: GoalPolos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GoalPolos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GoalPolos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GoalPolos_id_seq" OWNED BY public."GoalPolos".id;


--
-- Name: Goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Goals" (
    id integer NOT NULL,
    title character varying(255),
    "startsOn" date NOT NULL,
    "endsOn" date NOT NULL,
    status character varying(255) DEFAULT 'active'::character varying NOT NULL,
    "createdBy" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "workDays" integer DEFAULT 5 NOT NULL,
    kind character varying(255) DEFAULT 'team'::character varying NOT NULL
);


--
-- Name: Goals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Goals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Goals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Goals_id_seq" OWNED BY public."Goals".id;


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
    "indicatedBy" integer,
    "isHistorical" boolean DEFAULT false NOT NULL,
    "slaAlertedAt" timestamp with time zone,
    "affiliateId" integer
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
    reactions text,
    "isEdited" boolean DEFAULT false NOT NULL,
    "isGif" boolean DEFAULT false NOT NULL
);


--
-- Name: PasswordResets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PasswordResets" (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "tokenHash" character varying(64) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "usedAt" timestamp with time zone,
    "requestIp" character varying(64),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: PasswordResets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."PasswordResets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PasswordResets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."PasswordResets_id_seq" OWNED BY public."PasswordResets".id;


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
    "reminderTaskId" integer,
    "commissionSettledAt" timestamp with time zone,
    "commissionSettledBy" integer,
    "commissionNote" text
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
    "updatedAt" timestamp with time zone NOT NULL,
    "affiliateId" integer
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
-- Name: StudentTokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StudentTokens" (
    id integer NOT NULL,
    "studentId" integer NOT NULL,
    kind character varying(12) NOT NULL,
    "tokenHash" character varying(64) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "usedAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: StudentTokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."StudentTokens_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: StudentTokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."StudentTokens_id_seq" OWNED BY public."StudentTokens".id;


--
-- Name: Students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Students" (
    id integer NOT NULL,
    rgm character varying(40) NOT NULL,
    name character varying(160) NOT NULL,
    email character varying(160),
    phone character varying(40),
    "courseName" character varying(200),
    "poloId" integer,
    "responsibleUserId" integer,
    "leadId" integer,
    "passwordHash" character varying(255),
    "activatedAt" timestamp with time zone,
    "blockedAt" timestamp with time zone,
    "sessionVersion" integer DEFAULT 0 NOT NULL,
    "lastLoginAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Students_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Students_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Students_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Students_id_seq" OWNED BY public."Students".id;


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
    "botReminderAt" timestamp with time zone,
    "isHistorical" boolean DEFAULT false NOT NULL,
    "lastMessageId" character varying(255),
    "lastMessageFromMe" boolean DEFAULT false NOT NULL,
    "lastMessageAck" integer DEFAULT 0 NOT NULL,
    "lastMessageType" character varying(255),
    "lastMessageAuthor" character varying(255),
    "lastMessageAt" timestamp with time zone,
    "waPinned" boolean DEFAULT false NOT NULL
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
    "efiPayeeCode" character varying(255),
    preferences text,
    "coordArea" character varying(255),
    phone character varying(255)
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
-- Name: WebhookDeliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebhookDeliveries" (
    id integer NOT NULL,
    "webhookId" integer NOT NULL,
    payload text NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "nextAttemptAt" timestamp with time zone NOT NULL,
    "claimedAt" timestamp with time zone,
    "lastError" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: WebhookDeliveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."WebhookDeliveries_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: WebhookDeliveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."WebhookDeliveries_id_seq" OWNED BY public."WebhookDeliveries".id;


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
    "ownerId" integer,
    "historyImportedAt" timestamp with time zone,
    "statusSince" timestamp with time zone
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
-- Name: AcademicAnalyses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicAnalyses" ALTER COLUMN id SET DEFAULT nextval('public."AcademicAnalyses_id_seq"'::regclass);


--
-- Name: AffiliateAudiences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateAudiences" ALTER COLUMN id SET DEFAULT nextval('public."AffiliateAudiences_id_seq"'::regclass);


--
-- Name: AffiliateBonuses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateBonuses" ALTER COLUMN id SET DEFAULT nextval('public."AffiliateBonuses_id_seq"'::regclass);


--
-- Name: AffiliateCampaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateCampaigns" ALTER COLUMN id SET DEFAULT nextval('public."AffiliateCampaigns_id_seq"'::regclass);


--
-- Name: AffiliateMaterials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateMaterials" ALTER COLUMN id SET DEFAULT nextval('public."AffiliateMaterials_id_seq"'::regclass);


--
-- Name: Affiliates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Affiliates" ALTER COLUMN id SET DEFAULT nextval('public."Affiliates_id_seq"'::regclass);


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
-- Name: AutomationTriggers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationTriggers" ALTER COLUMN id SET DEFAULT nextval('public."AutomationTriggers_id_seq"'::regclass);


--
-- Name: CampaignShippings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShippings" ALTER COLUMN id SET DEFAULT nextval('public."CampaignShippings_id_seq"'::regclass);


--
-- Name: Campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns" ALTER COLUMN id SET DEFAULT nextval('public."Campaigns_id_seq"'::regclass);


--
-- Name: ChatFlowRuns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatFlowRuns" ALTER COLUMN id SET DEFAULT nextval('public."ChatFlowRuns_id_seq"'::regclass);


--
-- Name: ChatFlowStats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatFlowStats" ALTER COLUMN id SET DEFAULT nextval('public."ChatFlowStats_id_seq"'::regclass);


--
-- Name: ChatFlows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatFlows" ALTER COLUMN id SET DEFAULT nextval('public."ChatFlows_id_seq"'::regclass);


--
-- Name: ChatbotNodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatbotNodes" ALTER COLUMN id SET DEFAULT nextval('public."ChatbotNodes_id_seq"'::regclass);


--
-- Name: ClientErrors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClientErrors" ALTER COLUMN id SET DEFAULT nextval('public."ClientErrors_id_seq"'::regclass);


--
-- Name: CommercialGrades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommercialGrades" ALTER COLUMN id SET DEFAULT nextval('public."CommercialGrades_id_seq"'::regclass);


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
-- Name: CurricularAnalyses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CurricularAnalyses" ALTER COLUMN id SET DEFAULT nextval('public."CurricularAnalyses_id_seq"'::regclass);


--
-- Name: GoalMembers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GoalMembers" ALTER COLUMN id SET DEFAULT nextval('public."GoalMembers_id_seq"'::regclass);


--
-- Name: GoalPolos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GoalPolos" ALTER COLUMN id SET DEFAULT nextval('public."GoalPolos_id_seq"'::regclass);


--
-- Name: Goals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Goals" ALTER COLUMN id SET DEFAULT nextval('public."Goals_id_seq"'::regclass);


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
-- Name: PasswordResets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasswordResets" ALTER COLUMN id SET DEFAULT nextval('public."PasswordResets_id_seq"'::regclass);


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
-- Name: StudentTokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentTokens" ALTER COLUMN id SET DEFAULT nextval('public."StudentTokens_id_seq"'::regclass);


--
-- Name: Students id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Students" ALTER COLUMN id SET DEFAULT nextval('public."Students_id_seq"'::regclass);


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
-- Name: WebhookDeliveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDeliveries" ALTER COLUMN id SET DEFAULT nextval('public."WebhookDeliveries_id_seq"'::regclass);


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
-- Name: AcademicAnalyses AcademicAnalyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicAnalyses"
    ADD CONSTRAINT "AcademicAnalyses_pkey" PRIMARY KEY (id);


--
-- Name: AffiliateAudiences AffiliateAudiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateAudiences"
    ADD CONSTRAINT "AffiliateAudiences_pkey" PRIMARY KEY (id);


--
-- Name: AffiliateBonuses AffiliateBonuses_leadId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateBonuses"
    ADD CONSTRAINT "AffiliateBonuses_leadId_key" UNIQUE ("leadId");


--
-- Name: AffiliateBonuses AffiliateBonuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateBonuses"
    ADD CONSTRAINT "AffiliateBonuses_pkey" PRIMARY KEY (id);


--
-- Name: AffiliateCampaigns AffiliateCampaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateCampaigns"
    ADD CONSTRAINT "AffiliateCampaigns_pkey" PRIMARY KEY (id);


--
-- Name: AffiliateMaterials AffiliateMaterials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateMaterials"
    ADD CONSTRAINT "AffiliateMaterials_pkey" PRIMARY KEY (id);


--
-- Name: Affiliates Affiliates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Affiliates"
    ADD CONSTRAINT "Affiliates_pkey" PRIMARY KEY (id);


--
-- Name: Affiliates Affiliates_portalToken_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Affiliates"
    ADD CONSTRAINT "Affiliates_portalToken_key" UNIQUE ("portalToken");


--
-- Name: Affiliates Affiliates_refCode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Affiliates"
    ADD CONSTRAINT "Affiliates_refCode_key" UNIQUE ("refCode");


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
-- Name: AutomationTriggers AutomationTriggers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationTriggers"
    ADD CONSTRAINT "AutomationTriggers_pkey" PRIMARY KEY (id);


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
-- Name: ChatFlowRuns ChatFlowRuns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatFlowRuns"
    ADD CONSTRAINT "ChatFlowRuns_pkey" PRIMARY KEY (id);


--
-- Name: ChatFlowStats ChatFlowStats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatFlowStats"
    ADD CONSTRAINT "ChatFlowStats_pkey" PRIMARY KEY (id);


--
-- Name: ChatFlows ChatFlows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatFlows"
    ADD CONSTRAINT "ChatFlows_pkey" PRIMARY KEY (id);


--
-- Name: ChatbotNodes ChatbotNodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatbotNodes"
    ADD CONSTRAINT "ChatbotNodes_pkey" PRIMARY KEY (id);


--
-- Name: ClientErrors ClientErrors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ClientErrors"
    ADD CONSTRAINT "ClientErrors_pkey" PRIMARY KEY (id);


--
-- Name: CommercialGrades CommercialGrades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommercialGrades"
    ADD CONSTRAINT "CommercialGrades_pkey" PRIMARY KEY (id);


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
-- Name: CurricularAnalyses CurricularAnalyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CurricularAnalyses"
    ADD CONSTRAINT "CurricularAnalyses_pkey" PRIMARY KEY (id);


--
-- Name: GoalMembers GoalMembers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GoalMembers"
    ADD CONSTRAINT "GoalMembers_pkey" PRIMARY KEY (id);


--
-- Name: GoalPolos GoalPolos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GoalPolos"
    ADD CONSTRAINT "GoalPolos_pkey" PRIMARY KEY (id);


--
-- Name: Goals Goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Goals"
    ADD CONSTRAINT "Goals_pkey" PRIMARY KEY (id);


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
-- Name: PasswordResets PasswordResets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasswordResets"
    ADD CONSTRAINT "PasswordResets_pkey" PRIMARY KEY (id);


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
-- Name: StudentTokens StudentTokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentTokens"
    ADD CONSTRAINT "StudentTokens_pkey" PRIMARY KEY (id);


--
-- Name: Students Students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Students"
    ADD CONSTRAINT "Students_pkey" PRIMARY KEY (id);


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
-- Name: WebhookDeliveries WebhookDeliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDeliveries"
    ADD CONSTRAINT "WebhookDeliveries_pkey" PRIMARY KEY (id);


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
-- Name: academic_analyses_rgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX academic_analyses_rgm ON public."AcademicAnalyses" USING btree (rgm);


--
-- Name: academic_analyses_student_id_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX academic_analyses_student_id_version ON public."AcademicAnalyses" USING btree ("studentId", version);


--
-- Name: academic_analyses_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX academic_analyses_user_id_created_at ON public."AcademicAnalyses" USING btree ("userId", "createdAt");


--
-- Name: affiliate_audiences_target_type_target_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX affiliate_audiences_target_type_target_id ON public."AffiliateAudiences" USING btree ("targetType", "targetId");


--
-- Name: affiliate_bonuses_affiliate_id_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX affiliate_bonuses_affiliate_id_status ON public."AffiliateBonuses" USING btree ("affiliateId", status);


--
-- Name: affiliates_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX affiliates_owner_id ON public."Affiliates" USING btree ("ownerId");


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
-- Name: automationtriggers_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automationtriggers_event_idx ON public."AutomationTriggers" USING btree (event, active);


--
-- Name: chatflowruns_resume_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chatflowruns_resume_idx ON public."ChatFlowRuns" USING btree (status, "resumeAt");


--
-- Name: chatflowruns_ticket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chatflowruns_ticket_idx ON public."ChatFlowRuns" USING btree ("ticketId", status);


--
-- Name: chatflowstats_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chatflowstats_unique ON public."ChatFlowStats" USING btree ("flowId", "nodeId");


--
-- Name: client_errors_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_errors_code ON public."ClientErrors" USING btree (code);


--
-- Name: client_errors_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_errors_created_at ON public."ClientErrors" USING btree ("createdAt");


--
-- Name: client_errors_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX client_errors_route ON public."ClientErrors" USING btree (route);


--
-- Name: commercial_grades_catalog_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX commercial_grades_catalog_key ON public."CommercialGrades" USING btree ("catalogKey");


--
-- Name: commercial_grades_content_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX commercial_grades_content_hash ON public."CommercialGrades" USING btree ("contentHash");


--
-- Name: commercial_grades_course_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX commercial_grades_course_name ON public."CommercialGrades" USING btree ("courseName");


--
-- Name: contacts_community_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_community_id_idx ON public."Contacts" USING btree ("communityId") WHERE ("communityId" IS NOT NULL);


--
-- Name: contacts_is_staff_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_is_staff_idx ON public."Contacts" USING btree ("isStaff") WHERE ("isStaff" = true);


--
-- Name: contacts_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_kind_idx ON public."Contacts" USING btree (kind) WHERE ((kind)::text <> 'person'::text);


--
-- Name: contacts_parent_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_parent_group_idx ON public."Contacts" USING btree ("parentGroupId") WHERE ("parentGroupId" IS NOT NULL);


--
-- Name: curricular_analyses_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX curricular_analyses_lead_id ON public."CurricularAnalyses" USING btree ("leadId");


--
-- Name: curricular_analyses_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX curricular_analyses_user_id_created_at ON public."CurricularAnalyses" USING btree ("userId", "createdAt");


--
-- Name: curricular_followup_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX curricular_followup_due_idx ON public."CurricularAnalyses" USING btree ("followUpDueAt") WHERE ("followUpDueAt" IS NOT NULL);


--
-- Name: goal_members_goal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goal_members_goal_idx ON public."GoalMembers" USING btree ("goalId", "position");


--
-- Name: goal_polos_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX goal_polos_unique ON public."GoalPolos" USING btree ("goalId", "poloId");


--
-- Name: kb_chunks_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kb_chunks_document_id ON public."KbChunks" USING btree ("documentId");


--
-- Name: kb_chunks_tsv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kb_chunks_tsv_idx ON public."KbChunks" USING gin (tsv);


--
-- Name: leads_affiliate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_affiliate_id ON public."Leads" USING btree ("affiliateId");


--
-- Name: leads_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_contact_idx ON public."Leads" USING btree ("contactId");


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
-- Name: leads_won_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leads_won_at_idx ON public."Leads" USING btree ("wonAt") WHERE ("wonAt" IS NOT NULL);


--
-- Name: messages_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_contact_idx ON public."Messages" USING btree ("contactId") WHERE ("contactId" IS NOT NULL);


--
-- Name: messages_ticket_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_ticket_created_idx ON public."Messages" USING btree ("ticketId", "createdAt");


--
-- Name: messages_ticket_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_ticket_unread_idx ON public."Messages" USING btree ("ticketId") WHERE ((read = false) AND ("fromMe" = false));


--
-- Name: password_resets_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX password_resets_token_hash ON public."PasswordResets" USING btree ("tokenHash");


--
-- Name: password_resets_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_resets_user_id_created_at ON public."PasswordResets" USING btree ("userId", "createdAt");


--
-- Name: payments_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_lead_id ON public."Payments" USING btree ("leadId");


--
-- Name: payments_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_recipient_idx ON public."Payments" USING btree ("recipientUserId", status);


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
-- Name: proposals_affiliate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX proposals_affiliate_id ON public."Proposals" USING btree ("affiliateId");


--
-- Name: student_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX student_tokens_token_hash ON public."StudentTokens" USING btree ("tokenHash");


--
-- Name: students_responsible_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX students_responsible_user_id ON public."Students" USING btree ("responsibleUserId");


--
-- Name: students_rgm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX students_rgm ON public."Students" USING btree (rgm);


--
-- Name: ticket_events_ticket_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_events_ticket_created_idx ON public."TicketEvents" USING btree ("ticketId", "createdAt");


--
-- Name: ticket_events_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_events_ticket_id ON public."TicketEvents" USING btree ("ticketId");


--
-- Name: tickets_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_contact_idx ON public."Tickets" USING btree ("contactId");


--
-- Name: tickets_last_message_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_last_message_at_idx ON public."Tickets" USING btree ("lastMessageAt");


--
-- Name: tickets_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_lead_id ON public."Tickets" USING btree ("leadId");


--
-- Name: tickets_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_queue_idx ON public."Tickets" USING btree ("queueId");


--
-- Name: tickets_status_last_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_status_last_message_idx ON public."Tickets" USING btree (status, "lastMessageAt" DESC);


--
-- Name: tickets_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_user_status_idx ON public."Tickets" USING btree ("userId", status);


--
-- Name: tickets_whatsapp_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_whatsapp_contact_idx ON public."Tickets" USING btree ("whatsappId", "contactId");


--
-- Name: webhook_deliveries_status_next_attempt_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_status_next_attempt_at ON public."WebhookDeliveries" USING btree (status, "nextAttemptAt");


--
-- Name: wpp_keys_connection_type_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wpp_keys_connection_type_key_unique ON public."WppKeys" USING btree ("connectionId", type, "keyId");


--
-- Name: AcademicAnalyses AcademicAnalyses_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AcademicAnalyses"
    ADD CONSTRAINT "AcademicAnalyses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."Students"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AffiliateAudiences AffiliateAudiences_affiliateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateAudiences"
    ADD CONSTRAINT "AffiliateAudiences_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES public."Affiliates"(id) ON DELETE CASCADE;


--
-- Name: AffiliateAudiences AffiliateAudiences_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateAudiences"
    ADD CONSTRAINT "AffiliateAudiences_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: AffiliateBonuses AffiliateBonuses_affiliateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateBonuses"
    ADD CONSTRAINT "AffiliateBonuses_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES public."Affiliates"(id) ON DELETE CASCADE;


--
-- Name: AffiliateBonuses AffiliateBonuses_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateBonuses"
    ADD CONSTRAINT "AffiliateBonuses_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: AffiliateBonuses AffiliateBonuses_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateBonuses"
    ADD CONSTRAINT "AffiliateBonuses_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."AffiliateCampaigns"(id) ON DELETE SET NULL;


--
-- Name: AffiliateBonuses AffiliateBonuses_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateBonuses"
    ADD CONSTRAINT "AffiliateBonuses_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Leads"(id) ON DELETE CASCADE;


--
-- Name: AffiliateBonuses AffiliateBonuses_paidBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateBonuses"
    ADD CONSTRAINT "AffiliateBonuses_paidBy_fkey" FOREIGN KEY ("paidBy") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: AffiliateCampaigns AffiliateCampaigns_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateCampaigns"
    ADD CONSTRAINT "AffiliateCampaigns_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: AffiliateMaterials AffiliateMaterials_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateMaterials"
    ADD CONSTRAINT "AffiliateMaterials_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."AffiliateCampaigns"(id) ON DELETE SET NULL;


--
-- Name: AffiliateMaterials AffiliateMaterials_courseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateMaterials"
    ADD CONSTRAINT "AffiliateMaterials_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES public."Courses"(id) ON DELETE SET NULL;


--
-- Name: AffiliateMaterials AffiliateMaterials_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateMaterials"
    ADD CONSTRAINT "AffiliateMaterials_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Affiliates Affiliates_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Affiliates"
    ADD CONSTRAINT "Affiliates_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Affiliates Affiliates_poloId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Affiliates"
    ADD CONSTRAINT "Affiliates_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES public."Polos"(id) ON DELETE SET NULL;


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
-- Name: AutomationTriggers AutomationTriggers_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationTriggers"
    ADD CONSTRAINT "AutomationTriggers_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public."ChatFlows"(id) ON DELETE SET NULL;


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
-- Name: ChatFlowRuns ChatFlowRuns_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatFlowRuns"
    ADD CONSTRAINT "ChatFlowRuns_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public."ChatFlows"(id) ON DELETE CASCADE;


--
-- Name: ChatFlowRuns ChatFlowRuns_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatFlowRuns"
    ADD CONSTRAINT "ChatFlowRuns_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: ChatFlowStats ChatFlowStats_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatFlowStats"
    ADD CONSTRAINT "ChatFlowStats_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public."ChatFlows"(id) ON DELETE CASCADE;


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
-- Name: GoalMembers GoalMembers_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GoalMembers"
    ADD CONSTRAINT "GoalMembers_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public."Goals"(id) ON DELETE CASCADE;


--
-- Name: GoalPolos GoalPolos_goalId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GoalPolos"
    ADD CONSTRAINT "GoalPolos_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES public."Goals"(id) ON DELETE CASCADE;


--
-- Name: GoalPolos GoalPolos_poloId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GoalPolos"
    ADD CONSTRAINT "GoalPolos_poloId_fkey" FOREIGN KEY ("poloId") REFERENCES public."Polos"(id) ON DELETE CASCADE;


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
-- Name: Leads Leads_affiliateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Leads"
    ADD CONSTRAINT "Leads_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES public."Affiliates"(id) ON DELETE SET NULL;


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
-- Name: PasswordResets PasswordResets_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PasswordResets"
    ADD CONSTRAINT "PasswordResets_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE CASCADE;


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
-- Name: Proposals Proposals_affiliateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Proposals"
    ADD CONSTRAINT "Proposals_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES public."Affiliates"(id) ON DELETE SET NULL;


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
-- Name: StudentTokens StudentTokens_studentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StudentTokens"
    ADD CONSTRAINT "StudentTokens_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES public."Students"(id) ON UPDATE CASCADE ON DELETE CASCADE;


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
-- Name: WebhookDeliveries WebhookDeliveries_webhookId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookDeliveries"
    ADD CONSTRAINT "WebhookDeliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES public."Webhooks"(id) ON DELETE CASCADE;


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
-- Name: WebhookDeliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WebhookDeliveries" ENABLE ROW LEVEL SECURITY;

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
INSERT INTO "SequelizeMeta" (name) VALUES ('20261015144841-webhook-deliveries.js') ON CONFLICT DO NOTHING;
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
INSERT INTO "SequelizeMeta" (name) VALUES ('20261030000002-historical-flag.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261030000003-sla-and-preferences.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261030000004-history-and-pictures.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261031000001-message-edited.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261031000002-ticket-last-message-state.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261101000001-ticket-last-message-backfill.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261101000002-affiliates.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261101000003-ticket-last-message-kind.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261101000004-ticket-last-message-at.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261101000005-ticket-dangling-last-message.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261102000001-message-gif-staff.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261102000002-groups-open.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261102000003-affiliate-external-link.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261102000004-merge-duplicate-tickets.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261103000001-clean-vcard-preview.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261103000002-contact-kind.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261103000003-default-quick-answers.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261104000001-performance-indexes.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261104000002-commission-settlement.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261104000003-user-coord-area.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261104000004-team-goals.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261104000005-affiliate-central.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261104000006-admin-role-consistency.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261104000007-affiliate-first-monthly.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261105000001-contact-community.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261105000002-dedupe-reactions.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261106000001-goal-polos.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261106000002-goal-semester.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261106000003-merge-tutoria-academico.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261107000001-chat-flows.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261108000001-whatsapp-status-since.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261109000001-ai-agent-functions.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261110000001-client-errors.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261110000002-contact-community-role.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261110000003-password-resets.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261111000001-analysis.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261111000002-commercial-grades.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261112000001-ticket-wa-pinned.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261113000001-curricular-follow-up.js') ON CONFLICT DO NOTHING;
INSERT INTO "SequelizeMeta" (name) VALUES ('20261116000001-client-errors-build.js') ON CONFLICT DO NOTHING;

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
