'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Mail,
  MessageSquare,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Trash2,
  Play,
  CalendarClock,
  Bell,
  LayoutTemplate,
  Loader2,
  BarChart3,
  Eye,
  Smartphone,
  Sparkles,
  X,
  Lock,
  Crown,
} from 'lucide-react';
import { communicationApi, subscriptionApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { OrganizerLimits } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP';
type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'PARTIALLY_SENT' | 'FAILED';
type CampaignType = 'INVITATION' | 'CONFIRMATION' | 'REMINDER_7D' | 'REMINDER_1D' | 'CUSTOM';

interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  type: CampaignType;
  subject?: string;
  body: string;
  status: CampaignStatus;
  totalSent: number;
  totalFailed: number;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
  _count: { recipients: number };
  createdBy: { firstName: string; lastName: string };
}

interface Template {
  id: string;
  name: string;
  channel: Channel;
  subject?: string;
  body: string;
  isDefault: boolean;
  createdAt: string;
}

interface ChannelStatus {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<Channel, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
};

const CHANNEL_ICONS: Record<Channel, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" />,
  SMS: <Smartphone className="h-4 w-4" />,
  WHATSAPP: <MessageSquare className="h-4 w-4" />,
};

const CHANNEL_COLORS: Record<Channel, string> = {
  EMAIL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SMS: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  WHATSAPP: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Brouillon',
  SCHEDULED: 'Planifiée',
  SENDING: 'En cours',
  SENT: 'Envoyée',
  PARTIALLY_SENT: 'Partielle',
  FAILED: 'Échouée',
};

const STATUS_STYLES: Record<CampaignStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  SCHEDULED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  SENDING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SENT: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  PARTIALLY_SENT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const TYPE_LABELS: Record<CampaignType, string> = {
  INVITATION: 'Invitation',
  CONFIRMATION: 'Confirmation',
  REMINDER_7D: 'Rappel J-7',
  REMINDER_1D: 'Rappel J-1',
  CUSTOM: 'Personnalisée',
};

const VARIABLES_HINT = [
  { key: '{{firstName}}', desc: 'Prénom du destinataire' },
  { key: '{{lastName}}', desc: 'Nom du destinataire' },
  { key: '{{eventName}}', desc: 'Nom de l\'événement' },
  { key: '{{eventDate}}', desc: 'Date de l\'événement' },
  { key: '{{eventTime}}', desc: 'Heure de l\'événement' },
  { key: '{{eventVenue}}', desc: 'Lieu' },
  { key: '{{eventCity}}', desc: 'Ville' },
  { key: '{{ticketSerial}}', desc: 'Numéro de billet' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommunicationPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates' | 'reminders'>('campaigns');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const queryClient = useQueryClient();

  const { data: limitsData, isLoading: limitsLoading } = useQuery<OrganizerLimits>({
    queryKey: ['my-subscription-limits'],
    queryFn: () => subscriptionApi.getMySubscription().then(r => (r.data as any).data.limits),
    staleTime: 30_000,
  });

  const { data: channelStatus } = useQuery<ChannelStatus>({
    queryKey: ['comm-channels'],
    queryFn: () => communicationApi.getChannelStatus().then(r => (r.data as any).data),
    staleTime: 60_000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ['comm-stats', eventId],
    queryFn: () => communicationApi.getEventStats(eventId).then(r => (r.data as any).data),
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns', eventId],
    queryFn: () => communicationApi.getCampaigns(eventId).then(r => (r.data as any).data),
    refetchOnMount: 'always',
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['comm-templates'],
    queryFn: () => communicationApi.getTemplates().then(r => (r.data as any).data),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => communicationApi.sendCampaign(id),
    onSuccess: (res) => {
      const d = (res.data as any).data;
      toast.success(`Envoi lancé — ${d.recipientCount} destinataires`);
      queryClient.invalidateQueries({ queryKey: ['campaigns', eventId] });
      queryClient.invalidateQueries({ queryKey: ['comm-stats', eventId] });
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => communicationApi.deleteCampaign(id),
    onSuccess: () => {
      toast.success('Campagne supprimée');
      queryClient.invalidateQueries({ queryKey: ['campaigns', eventId] });
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const autoRemindersMutation = useMutation({
    mutationFn: () => communicationApi.setupAutoReminders(eventId),
    onSuccess: (res) => {
      const d = (res.data as any).data;
      toast.success(d.message);
      queryClient.invalidateQueries({ queryKey: ['campaigns', eventId] });
    },
    onError: () => toast.error('Erreur lors de la configuration des rappels'),
  });

  const initDefaultsMutation = useMutation({
    mutationFn: () => communicationApi.initDefaultTemplates(),
    onSuccess: (res) => {
      const d = (res.data as any).data;
      toast.success(d.message);
      queryClient.invalidateQueries({ queryKey: ['comm-templates'] });
    },
    onError: () => toast.error('Erreur lors du chargement des modèles'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => communicationApi.deleteTemplate(id),
    onSuccess: () => {
      toast.success('Modèle supprimé');
      queryClient.invalidateQueries({ queryKey: ['comm-templates'] });
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const handleSend = (campaign: Campaign) => {
    if (campaign.status === 'SENT') {
      toast.error('Cette campagne a déjà été envoyée');
      return;
    }
    if (!confirm(`Envoyer "${campaign.name}" à tous les porteurs de billets ?`)) return;
    sendMutation.mutate(campaign.id);
  };

  const handleDelete = (campaign: Campaign) => {
    if (!confirm(`Supprimer "${campaign.name}" ?`)) return;
    deleteMutation.mutate(campaign.id);
  };

  const paywallHeader = (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Communication & Marketing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Emails, SMS et WhatsApp — Invitations, confirmations, rappels automatiques
          </p>
        </div>
      </div>
    </div>
  );

  if (limitsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {paywallHeader}
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      </div>
    );
  }

  if (!limitsData?.allowCommunication) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {paywallHeader}
        <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Lock className="h-9 w-9 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Module Communication & Marketing
            </h2>
            <p className="mt-3 text-gray-500 dark:text-gray-400 text-base leading-relaxed">
              Cette fonctionnalité n&apos;est pas incluse dans votre plan actuel.
              Passez à un plan supérieur pour accéder aux campagnes email, SMS, WhatsApp
              et aux rappels automatiques J-7 / J-1.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-6 text-left space-y-3 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Ce module comprend&nbsp;:
            </p>
            {[
              'Invitations et confirmations par email',
              'Rappels automatiques à J-7 et J-1 avec billet joint',
              'SMS et WhatsApp via Twilio',
              '10 modèles prêts à l\'emploi, anti-spam optimisés',
              'Suivi des envois et statistiques par campagne',
            ].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <CheckCircle2 className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <Link
            href="/dashboard/subscription"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg hover:from-indigo-700 hover:to-purple-700 transition-all"
          >
            <Crown className="h-4 w-4" />
            Voir les plans disponibles
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/events/${eventId}`}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Communication & Marketing</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Emails, SMS et WhatsApp — Invitations, confirmations, rappels automatiques
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Channel status badges */}
        <div className="flex flex-wrap gap-2">
          {(['EMAIL', 'SMS', 'WHATSAPP'] as Channel[]).map(ch => {
            const active = channelStatus?.[ch.toLowerCase() as keyof ChannelStatus] ?? false;
            return (
              <div
                key={ch}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                  active
                    ? CHANNEL_COLORS[ch]
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                )}
              >
                {CHANNEL_ICONS[ch]}
                {CHANNEL_LABELS[ch]}
                {active ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <span className="text-[10px] ml-1 opacity-70">Non configuré</span>
                )}
              </div>
            );
          })}
          {(!channelStatus?.sms || !channelStatus?.whatsapp) && (
            <p className="text-xs text-gray-400 dark:text-gray-500 self-center ml-1">
              SMS/WhatsApp nécessitent les clés Twilio dans le fichier <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">.env</code>
            </p>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Emails envoyés', value: stats?.emailSent ?? 0, icon: <Mail className="h-5 w-5 text-blue-500" />, color: 'blue' },
            { label: 'SMS envoyés', value: stats?.smsSent ?? 0, icon: <Smartphone className="h-5 w-5 text-green-500" />, color: 'green' },
            { label: 'WhatsApp', value: stats?.whatsappSent ?? 0, icon: <MessageSquare className="h-5 w-5 text-emerald-500" />, color: 'emerald' },
            { label: 'Campagnes totales', value: stats?.campaignCount ?? 0, icon: <BarChart3 className="h-5 w-5 text-indigo-500" />, color: 'indigo' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">{s.label}</span>
                {s.icon}
              </div>
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
          {([
            { key: 'campaigns', label: 'Campagnes', icon: <Send className="h-4 w-4" /> },
            { key: 'templates', label: 'Modèles', icon: <LayoutTemplate className="h-4 w-4" /> },
            { key: 'reminders', label: 'Rappels auto', icon: <Bell className="h-4 w-4" /> },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.key
                  ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── CAMPAIGNS TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'campaigns' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Campagnes <span className="text-gray-400 font-normal text-sm ml-1">({campaigns.length})</span>
              </h2>
              <button
                onClick={() => setShowNewCampaign(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                Nouvelle campagne
              </button>
            </div>

            {campaignsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : campaigns.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
                <Send className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">Aucune campagne créée</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 mb-4">
                  Créez votre première campagne d'email, SMS ou WhatsApp
                </p>
                <button
                  onClick={() => setShowNewCampaign(true)}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Créer une campagne
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map(campaign => (
                  <CampaignRow
                    key={campaign.id}
                    campaign={campaign}
                    onSend={handleSend}
                    onDelete={handleDelete}
                    onView={setSelectedCampaign}
                    isSending={sendMutation.isPending && sendMutation.variables === campaign.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'templates' && (
          <div className="space-y-5">
            {/* Actions bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Modèles <span className="text-gray-400 font-normal text-sm ml-1">({templates.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => initDefaultsMutation.mutate()}
                  disabled={initDefaultsMutation.isPending}
                  className="flex items-center gap-2 border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {initDefaultsMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Sparkles className="h-4 w-4" />}
                  Charger les 10 modèles prédéfinis
                </button>
                <button
                  onClick={() => setShowNewTemplate(true)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Nouveau modèle
                </button>
              </div>
            </div>

            {/* Anti-spam notice */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">Modèles anti-spam optimisés</p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-1 leading-relaxed">
                    Les 10 modèles prédéfinis respectent les règles de délivrabilité : structure XHTML/table, CSS inline, preheader, ratio texte/HTML équilibré, sans mots déclencheurs de spam, avec footer CAN-SPAM conforme.
                  </p>
                </div>
              </div>
            </div>

            {templates.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
                <LayoutTemplate className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">Aucun modèle</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 mb-6">
                  Chargez les 10 modèles prédéfinis ou créez le vôtre
                </p>
                <button
                  onClick={() => initDefaultsMutation.mutate()}
                  disabled={initDefaultsMutation.isPending}
                  className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {initDefaultsMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Sparkles className="h-4 w-4" />}
                  Charger les 10 modèles prédéfinis
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {templates.map(tpl => (
                  <TemplateCard
                    key={tpl.id}
                    template={tpl}
                    onDelete={(id) => {
                      if (confirm('Supprimer ce modèle ?')) deleteTemplateMutation.mutate(id);
                    }}
                  />
                ))}
              </div>
            )}

            {/* Variables reference */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 p-4">
              <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 mb-3">
                Variables disponibles dans les modèles
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {VARIABLES_HINT.map(v => (
                  <div key={v.key} className="flex items-center gap-2">
                    <code className="text-xs bg-white dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded font-mono">
                      {v.key}
                    </code>
                    <span className="text-xs text-indigo-600/70 dark:text-indigo-400/70">{v.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── REMINDERS TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'reminders' && (
          <ReminderTab
            campaigns={campaigns}
            onSetupReminders={() => autoRemindersMutation.mutate()}
            isLoading={autoRemindersMutation.isPending}
            onSend={handleSend}
          />
        )}
      </div>

      {/* Modals */}
      {showNewCampaign && (
        <NewCampaignModal
          eventId={eventId}
          channelStatus={channelStatus}
          templates={templates}
          onClose={() => setShowNewCampaign(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['campaigns', eventId] });
            setShowNewCampaign(false);
          }}
        />
      )}

      {showNewTemplate && (
        <NewTemplateModal
          onClose={() => setShowNewTemplate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['comm-templates'] });
            setShowNewTemplate(false);
          }}
        />
      )}

      {selectedCampaign && (
        <CampaignStatsModal
          campaign={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
        />
      )}
    </div>
  );
}

// ─── CampaignRow ──────────────────────────────────────────────────────────────

function CampaignRow({
  campaign,
  onSend,
  onDelete,
  onView,
  isSending,
}: {
  campaign: Campaign;
  onSend: (c: Campaign) => void;
  onDelete: (c: Campaign) => void;
  onView: (c: Campaign) => void;
  isSending: boolean;
}) {
  const canSend = campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED';

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-start gap-4">
      <div className={cn('p-2 rounded-lg flex-shrink-0', CHANNEL_COLORS[campaign.channel])}>
        {CHANNEL_ICONS[campaign.channel]}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="font-medium text-gray-900 dark:text-white text-sm">{campaign.name}</span>
          <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', STATUS_STYLES[campaign.status])}>
            {STATUS_LABELS[campaign.status]}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium">
            {TYPE_LABELS[campaign.type]}
          </span>
        </div>

        {campaign.subject && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{campaign.subject}</p>
        )}

        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {campaign._count.recipients > 0 && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              {campaign.totalSent} envoyés
            </span>
          )}
          {campaign.totalFailed > 0 && (
            <span className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              {campaign.totalFailed} échoués
            </span>
          )}
          {campaign.scheduledAt && campaign.status === 'SCHEDULED' && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(campaign.scheduledAt).toLocaleString('fr-FR')}
            </span>
          )}
          {campaign.sentAt && (
            <span className="flex items-center gap-1">
              <Send className="h-3 w-3" />
              {new Date(campaign.sentAt).toLocaleString('fr-FR')}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {(campaign.status === 'SENT' || campaign.status === 'PARTIALLY_SENT') && (
          <button
            onClick={() => onView(campaign)}
            className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            title="Voir les stats"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        )}
        {canSend && (
          <button
            onClick={() => onSend(campaign)}
            disabled={isSending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Envoyer
          </button>
        )}
        <button
          onClick={() => onDelete(campaign)}
          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title="Supprimer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onDelete,
}: {
  template: Template;
  onDelete: (id: string) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const isEmail = template.channel === 'EMAIL';

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium', CHANNEL_COLORS[template.channel])}>
              {CHANNEL_ICONS[template.channel]}
              {CHANNEL_LABELS[template.channel]}
            </span>
            {template.isDefault && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium">
                Prédéfini
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isEmail && (
              <button
                onClick={() => setShowPreview(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                title="Prévisualiser"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onDelete(template.id)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div>
          <h3 className="font-medium text-gray-900 dark:text-white text-sm">{template.name}</h3>
          {template.subject && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              Objet : {template.subject}
            </p>
          )}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">
          {template.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
        </p>
      </div>

      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">{template.name}</h2>
                {template.subject && (
                  <p className="text-xs text-gray-400 mt-0.5">Objet : {template.subject}</p>
                )}
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 p-4">
              <div
                className="max-w-[600px] mx-auto bg-white rounded-lg overflow-hidden shadow"
                dangerouslySetInnerHTML={{ __html: template.body }}
              />
            </div>
            <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Les variables comme <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{'{{firstName}}'}</code> seront remplacées automatiquement à l'envoi.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── ReminderTab ──────────────────────────────────────────────────────────────

function ReminderTab({
  campaigns,
  onSetupReminders,
  isLoading,
  onSend,
}: {
  campaigns: Campaign[];
  onSetupReminders: () => void;
  isLoading: boolean;
  onSend: (c: Campaign) => void;
}) {
  const reminders = campaigns.filter(c =>
    c.type === 'REMINDER_7D' || c.type === 'REMINDER_1D'
  );
  const r7 = campaigns.find(c => c.type === 'REMINDER_7D');
  const r1 = campaigns.find(c => c.type === 'REMINDER_1D');

  return (
    <div className="space-y-6">
      {/* Explanation card */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex-shrink-0">
            <Bell className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-1">Rappels automatiques</h3>
            <p className="text-sm text-indigo-700 dark:text-indigo-400 leading-relaxed">
              Envoyez automatiquement un email à tous les porteurs de billets 7 jours avant l'événement
              (récapitulatif + billet) et à la veille (rappel d'urgence). Les emails sont programmés à 8h00.
            </p>
            {!r7 || !r1 ? (
              <button
                onClick={onSetupReminders}
                disabled={isLoading}
                className="mt-4 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                Configurer les rappels J-7 et J-1
              </button>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Rappels configurés
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Reminder cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            type: 'REMINDER_7D' as const,
            campaign: r7,
            label: 'Rappel J-7',
            desc: '7 jours avant l\'événement',
            icon: '📅',
          },
          {
            type: 'REMINDER_1D' as const,
            campaign: r1,
            label: 'Rappel J-1',
            desc: 'La veille de l\'événement',
            icon: '⏰',
          },
        ].map(({ type, campaign, label, desc, icon }) => (
          <div
            key={type}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{icon}</span>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">{label}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
              </div>
            </div>

            {campaign ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', STATUS_STYLES[campaign.status])}>
                    {STATUS_LABELS[campaign.status]}
                  </span>
                  {campaign.scheduledAt && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(campaign.scheduledAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
                {campaign.status === 'SENT' && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {campaign.totalSent} emails envoyés
                  </p>
                )}
                {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                  <button
                    onClick={() => onSend(campaign)}
                    className="w-full mt-2 flex items-center justify-center gap-2 border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-xs font-medium py-2 rounded-lg transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Envoyer maintenant
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <AlertCircle className="h-4 w-4" />
                <span>Non configuré</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Timeline preview */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Calendrier des envois</h3>
        <div className="space-y-3">
          {[
            { icon: '📧', label: 'Invitation initiale', desc: 'À la création / publication de l\'événement', when: 'Maintenant' },
            { icon: '✅', label: 'Confirmation d\'inscription', desc: 'À chaque achat / génération de billet', when: 'Automatique' },
            { icon: '📅', label: 'Rappel J-7', desc: 'Rappel avec billet joint', when: '7 jours avant', active: !!r7 },
            { icon: '⏰', label: 'Rappel J-1', desc: 'Rappel de dernière minute', when: 'La veille', active: !!r1 },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm flex-shrink-0">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs text-gray-400">{item.when}</span>
                {'active' in item && (
                  item.active
                    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                    : <XCircle className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── NewCampaignModal ─────────────────────────────────────────────────────────

function NewCampaignModal({
  eventId,
  channelStatus,
  templates,
  onClose,
  onCreated,
}: {
  eventId: string;
  channelStatus?: ChannelStatus;
  templates: Template[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    channel: 'EMAIL' as Channel,
    type: 'CUSTOM' as CampaignType,
    subject: '',
    body: '',
    templateId: '',
    scheduledAt: '',
    sendNow: false,
  });
  const [showPreview, setShowPreview] = useState(false);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: any) => communicationApi.createCampaign(eventId, data),
    onSuccess: async (res) => {
      const campaign = (res.data as any).data;
      if (form.sendNow) {
        await communicationApi.sendCampaign(campaign.id);
        toast.success('Campagne créée et envoi lancé !');
      } else {
        toast.success('Campagne créée');
      }
      onCreated();
    },
    onError: () => toast.error('Erreur lors de la création'),
  });

  const channelTemplates = templates.filter(t => t.channel === form.channel);

  const handleTemplateSelect = (tplId: string) => {
    const tpl = templates.find(t => t.id === tplId);
    if (tpl) {
      setForm(f => ({
        ...f,
        templateId: tplId,
        subject: tpl.subject || f.subject,
        body: tpl.body,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) {
      toast.error('Nom et corps sont obligatoires');
      return;
    }
    const data: any = {
      name: form.name,
      channel: form.channel,
      type: form.type,
      body: form.body,
    };
    if (form.subject) data.subject = form.subject;
    if (form.templateId) data.templateId = form.templateId;
    if (form.scheduledAt && !form.sendNow) data.scheduledAt = form.scheduledAt;
    createMutation.mutate(data);
  };

  const isEmail = form.channel === 'EMAIL';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-white">Nouvelle campagne</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom de la campagne *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              placeholder="Ex: Invitation Summer Gala 2025"
            />
          </div>

          {/* Channel & Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Canal</label>
              <select
                value={form.channel}
                onChange={e => setForm(f => ({ ...f, channel: e.target.value as Channel, templateId: '' }))}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="EMAIL">📧 Email {channelStatus?.email ? '' : '(configuré)'}</option>
                <option value="SMS" disabled={!channelStatus?.sms}>📱 SMS {!channelStatus?.sms ? '(non configuré)' : ''}</option>
                <option value="WHATSAPP" disabled={!channelStatus?.whatsapp}>💬 WhatsApp {!channelStatus?.whatsapp ? '(non configuré)' : ''}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as CampaignType }))}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Template picker */}
          {channelTemplates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Utiliser un modèle (optionnel)
              </label>
              <select
                value={form.templateId}
                onChange={e => handleTemplateSelect(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">— Aucun modèle —</option>
                {channelTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Subject (email only) */}
          {isEmail && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Objet de l'email
              </label>
              <input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Ex: Vous êtes invité(e) à {{eventName}}"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Contenu *
              </label>
              {isEmail && (
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <Eye className="h-3 w-3" />
                  {showPreview ? 'Masquer aperçu' : 'Aperçu HTML'}
                </button>
              )}
            </div>

            {showPreview && isEmail ? (
              <div
                className="w-full min-h-[200px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white p-4 text-sm overflow-auto"
                dangerouslySetInnerHTML={{ __html: form.body }}
              />
            ) : (
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={8}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono resize-none"
                placeholder={isEmail
                  ? 'HTML ou texte. Utilisez {{firstName}}, {{eventName}}, etc.'
                  : 'Texte du message. Max 160 caractères pour SMS standard.'}
              />
            )}
            {!isEmail && (
              <p className="text-xs text-gray-400 mt-1">{form.body.length} caractères</p>
            )}
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Planifier l'envoi (optionnel)
              </label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value, sendNow: false }))}
                disabled={form.sendNow}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.sendNow}
                onChange={e => setForm(f => ({ ...f, sendNow: e.target.checked, scheduledAt: '' }))}
                className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                Envoyer immédiatement après création
              </span>
            </label>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={createMutation.isPending}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {form.sendNow ? 'Créer et envoyer' : form.scheduledAt ? 'Planifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NewTemplateModal ─────────────────────────────────────────────────────────

function NewTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    channel: 'EMAIL' as Channel,
    subject: '',
    body: '',
    isDefault: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => communicationApi.createTemplate(data),
    onSuccess: () => {
      toast.success('Modèle créé');
      onCreated();
    },
    onError: () => toast.error('Erreur lors de la création'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.body) { toast.error('Nom et corps obligatoires'); return; }
    createMutation.mutate(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-white">Nouveau modèle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              placeholder="Ex: Invitation standard"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Canal</label>
            <select
              value={form.channel}
              onChange={e => setForm(f => ({ ...f, channel: e.target.value as Channel }))}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            >
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
          </div>
          {form.channel === 'EMAIL' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Objet</label>
              <input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                placeholder="{{eventName}} — Votre invitation"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contenu *</label>
            <textarea
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              rows={6}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono dark:text-white"
              placeholder="HTML pour email, texte pour SMS/WhatsApp"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
              className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Marquer comme modèle par défaut</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Annuler</button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CampaignStatsModal ───────────────────────────────────────────────────────

function CampaignStatsModal({
  campaign,
  onClose,
}: {
  campaign: Campaign;
  onClose: () => void;
}) {
  const { data: stats } = useQuery({
    queryKey: ['campaign-stats', campaign.id],
    queryFn: () => communicationApi.getCampaignStats(campaign.id).then(r => (r.data as any).data),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-white">Statistiques</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">{campaign.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{campaign.channel} · {TYPE_LABELS[campaign.type]}</p>
          </div>

          {stats ? (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total', value: stats.total, color: 'text-gray-900 dark:text-white' },
                { label: 'Envoyés', value: stats.sent, color: 'text-green-600 dark:text-green-400' },
                { label: 'Échoués', value: stats.failed, color: 'text-red-500' },
              ].map(s => (
                <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                  <span className={cn('text-2xl font-bold', s.color)}>{s.value}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            </div>
          )}

          {stats && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Taux de succès</span>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{stats.successRate}%</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                  style={{ width: `${stats.successRate}%` }}
                />
              </div>
            </div>
          )}

          {campaign.sentAt && (
            <p className="text-xs text-gray-400">
              Envoyée le {new Date(campaign.sentAt).toLocaleString('fr-FR')}
            </p>
          )}
        </div>
        <div className="px-6 pb-4 flex justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Fermer</button>
        </div>
      </div>
    </div>
  );
}
