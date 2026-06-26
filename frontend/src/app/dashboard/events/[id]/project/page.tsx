'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FolderKanban,
  Plus,
  User,
  Calendar,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  PieChart,
  Users,
  UserPlus,
  Send,
  Loader2,
  LayoutGrid,
  GanttChartSquare,
} from 'lucide-react';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { projectApi, resolveMediaUrl } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type TaskCategory =
  | 'Traiteur'
  | 'Technique'
  | 'Marketing'
  | 'Sécurité'
  | 'Logistique'
  | 'Autre';

interface ProjectTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  category?: TaskCategory;
  assigneeId?: string;
  assigneeName?: string;
  startDate?: string;
  dueDate?: string;
  assignees?: Array<{
    id: string;
    userId: string;
    user: { id: string; firstName: string; lastName: string; email: string; avatar?: string };
  }>;
}

interface ProjectMember {
  id: string;
  userId: string;
  projectRole: string;
  user: { id: string; firstName: string; lastName: string; email: string; avatar?: string };
}

interface ProjectInvitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  projectRole: string;
  status: string;
  expiresAt: string;
}

interface BudgetExpense {
  id: string;
  label: string;
  amount: number;
  date?: string;
  notes?: string;
}

interface BudgetLine {
  id: string;
  category: string;
  label: string;
  plannedAmount: number;
  totalSpent: number;
  expenses: BudgetExpense[];
}

interface BudgetData {
  totalPlanned: number;
  totalSpent: number;
  lines: BudgetLine[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: { status: TaskStatus; label: string; color: string; headerBg: string; badgeBg: string }[] = [
  {
    status: 'TODO',
    label: 'À faire',
    color: 'border-gray-300 dark:border-gray-700',
    headerBg: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    badgeBg: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  },
  {
    status: 'IN_PROGRESS',
    label: 'En cours',
    color: 'border-blue-300 dark:border-blue-700',
    headerBg: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
  },
  {
    status: 'BLOCKED',
    label: 'Bloqué',
    color: 'border-red-300 dark:border-red-700',
    headerBg: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    badgeBg: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
  },
  {
    status: 'DONE',
    label: 'Terminé',
    color: 'border-green-300 dark:border-green-700',
    headerBg: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    badgeBg: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  Traiteur: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  Technique: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  Marketing: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  Sécurité: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  Logistique: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Autre: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const PRIORITY_DOT: Record<TaskPriority, string> = {
  LOW: 'bg-gray-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Basse',
  MEDIUM: 'Moyenne',
  HIGH: 'Haute',
  URGENT: 'Urgente',
};

const CATEGORIES: TaskCategory[] = [
  'Traiteur',
  'Technique',
  'Marketing',
  'Sécurité',
  'Logistique',
  'Autre',
];

const CHART_PALETTE = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
];

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

// ─── Invite Member Panel ──────────────────────────────────────────────────────

function InviteMemberPanel({ eventId, onSuccess }: { eventId: string; onSuccess: () => void }) {
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', projectRole: 'CONTRIBUTOR' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      await projectApi.inviteMember(eventId, form);
      setSuccess(`Invitation envoyée à ${form.email}`);
      setForm({ email: '', firstName: '', lastName: '', projectRole: 'CONTRIBUTOR' });
      onSuccess();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message ?? 'Erreur lors de l\'invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-indigo-600" />
        Inviter un membre
      </h3>
      <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input
          required type="email" placeholder="Email"
          value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          required placeholder="Prénom"
          value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
          className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          required placeholder="Nom"
          value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
          className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <div className="flex gap-2">
          <select
            value={form.projectRole} onChange={e => setForm(f => ({ ...f, projectRole: e.target.value }))}
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="CONTRIBUTOR">Collaborateur</option>
            <option value="MANAGER">Responsable</option>
          </select>
          <button type="submit" disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Inviter
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-2 text-sm text-emerald-600">{success}</p>}
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────

interface TaskModalProps {
  eventId: string;
  task?: ProjectTask;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  members: ProjectMember[];
}

function TaskModal({ eventId, task, defaultStatus, onClose, members }: TaskModalProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(task);

  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    category: (task?.category ?? '') as TaskCategory | '',
    assigneeIds: task?.assignees?.map(a => a.userId) ?? (task?.assigneeId ? [task.assigneeId] : []),
    startDate: task?.startDate ? task.startDate.slice(0, 10) : '',
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : '',
    priority: (task?.priority ?? 'MEDIUM') as TaskPriority,
    status: (task?.status ?? defaultStatus ?? 'TODO') as TaskStatus,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof projectApi.createTask>[1]) =>
      projectApi.createTask(eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', eventId] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof projectApi.updateTask>[2]) =>
      projectApi.updateTask(eventId, task!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', eventId] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectApi.deleteTask(eventId, task!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', eventId] });
      onClose();
    },
  });

  const isPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      category: form.category || undefined,
      assigneeIds: form.assigneeIds,
      startDate: form.startDate || undefined,
      dueDate: form.dueDate || undefined,
      priority: form.priority,
      status: form.status,
    };
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Modifier la tâche' : 'Nouvelle tâche'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Titre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Catégorie
              </label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as TaskCategory | '' }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Aucune —</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Priorité
              </label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="LOW">Basse</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
          </div>

          {/* Assignees multi-select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Assignés ({form.assigneeIds.length})
            </label>
            {members.length === 0 ? (
              <p className="text-xs text-gray-400 italic">Aucun membre dans ce projet.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {members.map(m => {
                  const checked = form.assigneeIds.includes(m.userId);
                  return (
                    <label key={m.userId} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-colors ${checked ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20' : 'border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          setForm(f => ({
                            ...f,
                            assigneeIds: e.target.checked
                              ? [...f.assigneeIds, m.userId]
                              : f.assigneeIds.filter(id => id !== m.userId),
                          }));
                        }}
                        className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
                      />
                      {m.user.avatar ? (
                        <img src={resolveMediaUrl(m.user.avatar)} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                          {m.user.firstName[0]}{m.user.lastName[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.user.firstName} {m.user.lastName}</p>
                        <p className="text-xs text-gray-400">{m.projectRole === 'MANAGER' ? 'Responsable' : 'Collaborateur'}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Start date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date de début</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Due date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Échéance
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Status (only shown in edit mode) */}
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Statut
              </label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as TaskStatus }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {KANBAN_COLUMNS.map(col => (
                  <option key={col.status} value={col.status}>{col.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Annuler
              </button>
            </div>
            {isEdit && (
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: ProjectTask;
  onEdit: (task: ProjectTask) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}

function TaskCard({ task, onEdit, onDragStart }: TaskCardProps) {
  const isOverdue =
    task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onClick={() => onEdit(task)}
      className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-3 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all select-none active:opacity-50"
    >
      {/* Priority dot + title */}
      <div className="flex items-start gap-2 mb-2">
        <span
          className={cn(
            'mt-1.5 h-2 w-2 rounded-full flex-shrink-0',
            PRIORITY_DOT[task.priority]
          )}
          title={PRIORITY_LABELS[task.priority]}
        />
        <p className="font-medium text-gray-900 dark:text-white text-sm leading-snug">
          {task.title}
        </p>
      </div>

      {/* Category badge */}
      {task.category && (
        <span
          className={cn(
            'inline-block text-xs px-2 py-0.5 rounded-full font-medium mb-2',
            CATEGORY_COLORS[task.category] ?? CATEGORY_COLORS['Autre']
          )}
        >
          {task.category}
        </span>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        {task.dueDate && (
          <span
            className={cn(
              'flex items-center gap-1',
              isOverdue && 'text-red-500 dark:text-red-400 font-medium'
            )}
          >
            <Calendar className="h-3 w-3" />
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>

      {/* Assignee avatars */}
      {(task.assignees && task.assignees.length > 0) ? (
        <div className="flex -space-x-1.5 mt-2">
          {task.assignees.slice(0, 4).map(a => (
            a.user.avatar ? (
              <img
                key={a.userId}
                src={resolveMediaUrl(a.user.avatar)}
                alt={`${a.user.firstName} ${a.user.lastName}`}
                title={`${a.user.firstName} ${a.user.lastName}`}
                className="w-6 h-6 rounded-full object-cover ring-2 ring-white dark:ring-gray-800 flex-shrink-0"
              />
            ) : (
              <div
                key={a.userId}
                title={`${a.user.firstName} ${a.user.lastName}`}
                className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-white dark:ring-gray-800 flex-shrink-0"
              >
                {a.user.firstName[0]}{a.user.lastName[0]}
              </div>
            )
          ))}
          {task.assignees.length > 4 && (
            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-[10px] font-bold ring-2 ring-white dark:ring-gray-800">
              +{task.assignees.length - 4}
            </div>
          )}
        </div>
      ) : task.assigneeName ? (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-[9px] text-gray-700 dark:text-gray-300 font-bold">
            {task.assigneeName[0]}
          </div>
          <span className="text-xs text-gray-500 truncate">{task.assigneeName}</span>
        </div>
      ) : null}
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  eventId: string;
  tasks: ProjectTask[];
  members: ProjectMember[];
}

function KanbanBoard({ eventId, tasks, members }: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [editTask, setEditTask] = useState<ProjectTask | undefined>(undefined);
  const [addStatus, setAddStatus] = useState<TaskStatus | null>(null);
  const dragTaskIdRef = useRef<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      projectApi.updateTask(eventId, taskId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', eventId] });
    },
  });

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    dragTaskIdRef.current = taskId;
    e.dataTransfer.setData('text/plain', taskId);
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain') || dragTaskIdRef.current;
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== status) {
      updateMutation.mutate({ taskId, status });
    }
    dragTaskIdRef.current = null;
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {KANBAN_COLUMNS.map(col => {
          const columnTasks = tasks.filter(t => t.status === col.status);
          return (
            <div
              key={col.status}
              onDragOver={e => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.status)}
              className={cn(
                'flex flex-col rounded-xl border-2 min-h-[300px] transition-colors',
                col.color,
                dragOverColumn === col.status && 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-400'
              )}
            >
              {/* Column header */}
              <div className={cn('flex items-center justify-between px-3 py-2 rounded-t-lg', col.headerBg)}>
                <span className="font-semibold text-sm">{col.label}</span>
                <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', col.badgeBg)}>
                  {columnTasks.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2 p-2 flex-1">
                {columnTasks.map(task => (
                  <div
                    key={task.id}
                    onDragEnd={handleDragEnd}
                  >
                    <TaskCard
                      task={task}
                      onEdit={t => setEditTask(t)}
                      onDragStart={handleDragStart}
                    />
                  </div>
                ))}

                {columnTasks.length === 0 && (
                  <div className="flex-1 flex items-center justify-center text-xs text-gray-400 dark:text-gray-600 py-4">
                    Aucune tâche
                  </div>
                )}
              </div>

              {/* Add button */}
              <button
                onClick={() => setAddStatus(col.status)}
                className="flex items-center gap-1.5 mx-2 mb-2 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </button>
            </div>
          );
        })}
      </div>

      {/* Edit task modal */}
      {editTask && (
        <TaskModal
          eventId={eventId}
          task={editTask}
          onClose={() => setEditTask(undefined)}
          members={members}
        />
      )}

      {/* Add task modal */}
      {addStatus && (
        <TaskModal
          eventId={eventId}
          defaultStatus={addStatus}
          onClose={() => setAddStatus(null)}
          members={members}
        />
      )}
    </>
  );
}

// ─── Add Line Modal ───────────────────────────────────────────────────────────

interface AddLineModalProps {
  eventId: string;
  onClose: () => void;
}

function AddLineModal({ eventId, onClose }: AddLineModalProps) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<TaskCategory | ''>('');
  const [label, setLabel] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      projectApi.createLine(eventId, {
        category: category || 'Autre',
        label: label.trim(),
        plannedAmount: parseFloat(plannedAmount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-budget', eventId] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !plannedAmount) return;
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Nouvelle ligne budgétaire
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Catégorie
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as TaskCategory | '')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Aucune —</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Libellé <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Montant prévu (€) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={plannedAmount}
              onChange={e => setPlannedAmount(e.target.value)}
              required
              min="0"
              step="0.01"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Expense Modal ────────────────────────────────────────────────────────

interface AddExpenseModalProps {
  eventId: string;
  lineId: string;
  onClose: () => void;
}

function AddExpenseModal({ eventId, lineId, onClose }: AddExpenseModalProps) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      projectApi.addExpense(eventId, lineId, {
        label: label.trim(),
        amount: parseFloat(amount),
        date: date || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-budget', eventId] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !amount) return;
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Ajouter une dépense
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Libellé <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Montant (€) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Budget Tab ───────────────────────────────────────────────────────────────

interface BudgetTabProps {
  eventId: string;
}

function BudgetTab({ eventId }: BudgetTabProps) {
  const queryClient = useQueryClient();
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [showAddLine, setShowAddLine] = useState(false);
  const [addExpenseLineId, setAddExpenseLineId] = useState<string | null>(null);

  const { data: budget, isLoading, error } = useQuery<BudgetData>({
    queryKey: ['project-budget', eventId],
    queryFn: () => projectApi.getBudget(eventId).then(r => (r.data as { data: BudgetData }).data),
  });

  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) => projectApi.deleteLine(eventId, lineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-budget', eventId] });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: ({ lineId, expenseId }: { lineId: string; expenseId: string }) =>
      projectApi.deleteExpense(eventId, lineId, expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-budget', eventId] });
    },
  });

  const toggleLine = (lineId: string) => {
    setExpandedLines(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !budget) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
        <p className="text-gray-500 dark:text-gray-400">Impossible de charger le budget</p>
      </div>
    );
  }

  const totalPlanned = budget.totalPlanned ?? 0;
  const totalSpent = budget.totalSpent ?? 0;
  const remaining = totalPlanned - totalSpent;
  const progressPct = totalPlanned > 0 ? Math.min((totalSpent / totalPlanned) * 100, 100) : 0;
  const progressColor =
    progressPct >= 100
      ? 'bg-red-500'
      : progressPct >= 80
      ? 'bg-amber-500'
      : 'bg-green-500';

  // Build donut data by grouping lines by category
  const categoryTotals: Record<string, number> = {};
  (budget.lines ?? []).forEach(line => {
    const cat = line.category || 'Autre';
    categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (line.plannedAmount ?? 0);
  });
  const donutData = Object.entries(categoryTotals).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Budget total
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(totalPlanned)}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Dépensé
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(totalSpent)}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Restant
          </p>
          <p className={cn('text-xl font-bold', remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white')}>
            {formatCurrency(remaining)}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Progression
          </p>
          <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {progressPct.toFixed(0)}%
          </p>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={cn('h-2 rounded-full transition-all', progressColor)}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut chart */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            Répartition par catégorie
          </h3>
          {donutData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <PieChart className="h-8 w-8 text-gray-300 dark:text-gray-700 mb-2" />
              <p className="text-sm text-gray-400 dark:text-gray-600">
                Aucune ligne budgétaire
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <RechartsPieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {donutData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    background: 'var(--tooltip-bg, #fff)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>
                  )}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Budget lines table */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Lignes budgétaires
            </h3>
          </div>

          {budget.lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <PieChart className="h-10 w-10 text-gray-300 dark:text-gray-700 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                Aucune ligne budgétaire
              </p>
              <button
                onClick={() => setShowAddLine(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
                Ajouter une ligne
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                      Catégorie
                    </th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                      Libellé
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                      Prévu
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                      Réel
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                      Écart
                    </th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {budget.lines.map(line => {
                    const gap = line.plannedAmount - line.totalSpent;
                    const isExpanded = expandedLines.has(line.id);
                    return (
                      <>
                        <tr
                          key={line.id}
                          className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                        >
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-block text-xs px-2 py-0.5 rounded-full font-medium',
                                CATEGORY_COLORS[line.category] ?? CATEGORY_COLORS['Autre']
                              )}
                            >
                              {line.category || 'Autre'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                            {line.label}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                            {formatCurrency(line.plannedAmount)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                            {formatCurrency(line.totalSpent)}
                          </td>
                          <td className={cn('px-4 py-3 text-right font-medium', gap >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                            {formatCurrency(gap)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setAddExpenseLineId(line.id)}
                                title="Ajouter une dépense"
                                className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => toggleLine(line.id)}
                                title={isExpanded ? 'Réduire' : 'Développer'}
                                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => deleteLineMutation.mutate(line.id)}
                                disabled={deleteLineMutation.isPending}
                                title="Supprimer"
                                className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded &&
                          line.expenses.map(expense => (
                            <tr
                              key={expense.id}
                              className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/20"
                            >
                              <td className="pl-8 pr-4 py-2 text-gray-400" colSpan={1} />
                              <td className="px-4 py-2 text-gray-700 dark:text-gray-300 text-xs">
                                <span className="font-medium">{expense.label}</span>
                                {expense.notes && (
                                  <span className="ml-2 text-gray-400 dark:text-gray-600">
                                    — {expense.notes}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right text-xs text-gray-400" />
                              <td className="px-4 py-2 text-right text-xs text-gray-700 dark:text-gray-300">
                                {formatCurrency(expense.amount)}
                              </td>
                              <td className="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                                {expense.date ? formatDate(expense.date) : '—'}
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center justify-end">
                                  <button
                                    onClick={() =>
                                      deleteExpenseMutation.mutate({
                                        lineId: line.id,
                                        expenseId: expense.id,
                                      })
                                    }
                                    disabled={deleteExpenseMutation.isPending}
                                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-40"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        {isExpanded && line.expenses.length === 0 && (
                          <tr className="bg-gray-50/50 dark:bg-gray-800/10">
                            <td colSpan={6} className="px-8 py-2 text-xs text-gray-400 dark:text-gray-600 italic">
                              Aucune dépense enregistrée
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>

              <div className="p-4">
                <button
                  onClick={() => setShowAddLine(true)}
                  className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter une ligne
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddLine && (
        <AddLineModal eventId={eventId} onClose={() => setShowAddLine(false)} />
      )}
      {addExpenseLineId && (
        <AddExpenseModal
          eventId={eventId}
          lineId={addExpenseLineId}
          onClose={() => setAddExpenseLineId(null)}
        />
      )}
    </div>
  );
}

// ─── Gantt View ───────────────────────────────────────────────────────────────

function GanttView({ tasks, onTaskClick }: { tasks: ProjectTask[]; onTaskClick: (t: ProjectTask) => void }) {
  const DAY_W = 36; // px per day
  const ROW_H = 44;
  const LABEL_W = 200;

  const tasksWithDates = tasks.filter(t => t.dueDate);

  if (tasksWithDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <GanttChartSquare className="h-12 w-12 text-gray-300 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Aucune tâche avec une date d&apos;échéance.<br />
          Ajoutez des dates pour voir le chronogramme.
        </p>
      </div>
    );
  }

  // Compute date range
  const allDates = tasksWithDates.flatMap(t => [
    t.startDate ? new Date(t.startDate) : new Date(),
    new Date(t.dueDate!),
  ]);
  const rawMin = new Date(Math.min(...allDates.map(d => d.getTime())));
  const rawMax = new Date(Math.max(...allDates.map(d => d.getTime())));
  // Start on Monday of the week before, end on Sunday of the week after
  const rangeStart = new Date(rawMin);
  rangeStart.setDate(rangeStart.getDate() - ((rangeStart.getDay() + 6) % 7) - 7);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rawMax);
  rangeEnd.setDate(rangeEnd.getDate() + (7 - rangeEnd.getDay()) + 7);
  rangeEnd.setHours(0, 0, 0, 0);

  const totalDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayOffset = Math.round((today.getTime() - rangeStart.getTime()) / 86400000);

  // Generate week headers
  const weeks: { label: string; startDay: number; days: number }[] = [];
  let d = new Date(rangeStart);
  while (d < rangeEnd) {
    const weekStart = Math.round((d.getTime() - rangeStart.getTime()) / 86400000);
    const weekDays = Math.min(7, totalDays - weekStart);
    weeks.push({
      label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      startDay: weekStart,
      days: weekDays,
    });
    d.setDate(d.getDate() + 7);
  }

  const priorityColors: Record<string, string> = {
    HIGH: 'bg-red-500',
    MEDIUM: 'bg-indigo-500',
    LOW: 'bg-emerald-500',
    CRITICAL: 'bg-purple-600',
    URGENT: 'bg-orange-500',
  };

  const statusOpacity: Record<string, string> = {
    DONE: 'opacity-50',
    BLOCKED: 'opacity-70',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_W + totalDays * DAY_W }}>
          {/* Header row — week labels */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="flex-shrink-0 px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200 dark:border-gray-700">
              Tâche
            </div>
            <div className="flex relative" style={{ width: totalDays * DAY_W, height: 36 }}>
              {weeks.map((w, i) => (
                <div
                  key={i}
                  style={{ width: w.days * DAY_W, left: w.startDay * DAY_W, position: 'absolute', top: 0, bottom: 0 }}
                  className="border-r border-gray-200 dark:border-gray-700 px-2 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 overflow-hidden whitespace-nowrap"
                >
                  {w.label}
                </div>
              ))}
            </div>
          </div>

          {/* Today marker + task rows */}
          <div className="relative">
            {/* Today vertical line */}
            {todayOffset >= 0 && todayOffset <= totalDays && (
              <div
                style={{ left: LABEL_W + todayOffset * DAY_W + DAY_W / 2, position: 'absolute', top: 0, bottom: 0, width: 2, zIndex: 10 }}
                className="bg-red-400/60 pointer-events-none"
              />
            )}

            {tasksWithDates.map(task => {
              const start = task.startDate
                ? new Date(task.startDate)
                : new Date();
              start.setHours(0, 0, 0, 0);
              const end = new Date(task.dueDate!);
              end.setHours(0, 0, 0, 0);

              const startDay = Math.max(0, Math.round((start.getTime() - rangeStart.getTime()) / 86400000));
              const endDay = Math.min(totalDays, Math.round((end.getTime() - rangeStart.getTime()) / 86400000));
              const duration = Math.max(1, endDay - startDay + 1);

              const color = priorityColors[task.priority] ?? 'bg-indigo-500';
              const opacity = statusOpacity[task.status] ?? '';

              return (
                <div
                  key={task.id}
                  style={{ height: ROW_H }}
                  className="flex items-center border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/10 transition-colors"
                >
                  {/* Task label */}
                  <div
                    style={{ width: LABEL_W, minWidth: LABEL_W }}
                    className="flex-shrink-0 px-3 border-r border-gray-200 dark:border-gray-700 h-full flex items-center gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[160px]" title={task.title}>
                        {task.title}
                      </p>
                      {task.assignees && task.assignees.length > 0 && (
                        <div className="flex -space-x-1 mt-0.5">
                          {task.assignees.slice(0, 3).map(a => (
                            a.user.avatar ? (
                              <img key={a.userId} src={resolveMediaUrl(a.user.avatar)} alt="" title={`${a.user.firstName} ${a.user.lastName}`}
                                className="w-4 h-4 rounded-full object-cover ring-1 ring-white dark:ring-gray-800" />
                            ) : (
                              <div key={a.userId} title={`${a.user.firstName} ${a.user.lastName}`}
                                className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[8px] font-bold ring-1 ring-white dark:ring-gray-800">
                                {a.user.firstName[0]}
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timeline area */}
                  <div className="relative flex-1 h-full" style={{ width: totalDays * DAY_W }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: startDay * DAY_W + 2,
                        width: duration * DAY_W - 4,
                        top: 8,
                        bottom: 8,
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                      className={`${color} ${opacity} hover:brightness-110 transition-all flex items-center px-2 overflow-hidden shadow-sm`}
                      onClick={() => onTaskClick(task)}
                      title={`${task.title} — cliquez pour modifier`}
                    >
                      <span className="text-white text-xs font-medium truncate">{task.title}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Tasks without dates */}
            {tasks.filter(t => !t.dueDate).length > 0 && (
              <div className="px-4 py-3 text-xs text-gray-400 italic border-t border-gray-100 dark:border-gray-700/50">
                {tasks.filter(t => !t.dueDate).length} tâche(s) sans date d&apos;échéance non affichée(s).
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 flex-wrap">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Priorité :</span>
            {[['CRITICAL', 'bg-purple-600', 'Critique'], ['HIGH', 'bg-red-500', 'Haute'], ['MEDIUM', 'bg-indigo-500', 'Moyenne'], ['LOW', 'bg-emerald-500', 'Basse']].map(([, c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${c}`} />
                <span className="text-xs text-gray-500 dark:text-gray-400">{l}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 ml-4">
              <div className="w-0.5 h-4 bg-red-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Aujourd&apos;hui</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'retroplanning' | 'budget' | 'members';

export default function ProjectPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('retroplanning');
  const [projectView, setProjectView] = useState<'kanban' | 'gantt'>('kanban');
  const [ganttEditTask, setGanttEditTask] = useState<ProjectTask | undefined>(undefined);

  const { user } = useAuthStore();

  const {
    data: tasks,
    isLoading: tasksLoading,
    error: tasksError,
  } = useQuery<ProjectTask[]>({
    queryKey: ['project-tasks', eventId],
    queryFn: () =>
      projectApi.getTasks(eventId).then(r => (r.data as { data: ProjectTask[] }).data),
    enabled: activeTab === 'retroplanning',
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const membersQuery = useQuery({
    queryKey: ['project-members', eventId],
    queryFn: async () => {
      const res = await projectApi.getMembers(eventId);
      return res.data.data as { members: ProjectMember[]; invitations: ProjectInvitation[] };
    },
  });
  const members = membersQuery.data?.members ?? [];

  const myMembership = members.find(m => m.userId === user?.id);
  const isProjectContributor = myMembership?.projectRole === 'CONTRIBUTOR';
  // Organizers always have full access
  const canSeeBudget = !isProjectContributor;

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Retirer ce membre du projet ?')) return;
    try {
      await projectApi.removeMember(eventId, memberId);
      membersQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['project-members', eventId] });
    } catch {
      // silent
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/events/${eventId}`}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <FolderKanban className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-none">
                Gestion de projet
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Planification et suivi budgétaire
              </p>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('retroplanning')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-all',
              activeTab === 'retroplanning'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            Rétroplanning
          </button>
          {canSeeBudget && (
            <button
              onClick={() => setActiveTab('budget')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-all',
                activeTab === 'budget'
                  ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Budget
            </button>
          )}
          <button
            onClick={() => setActiveTab('members')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all',
              activeTab === 'members'
                ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <Users className="h-4 w-4" />
            Membres ({members.length})
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'retroplanning' && (
        <>
          {tasksLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600" />
            </div>
          )}
          {tasksError && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                Impossible de charger les tâches
              </p>
            </div>
          )}
          {!tasksLoading && !tasksError && (
            <>
              {/* View toggle */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setProjectView('kanban')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${projectView === 'kanban' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-indigo-300'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Kanban
                </button>
                <button
                  onClick={() => setProjectView('gantt')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${projectView === 'gantt' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-indigo-300'}`}
                >
                  <GanttChartSquare className="h-4 w-4" />
                  Chronogramme
                </button>
              </div>
              {projectView === 'kanban' ? (
                <KanbanBoard eventId={eventId} tasks={tasks ?? []} members={members} />
              ) : (
                <GanttView
                  tasks={tasks ?? []}
                  onTaskClick={task => {
                    // Open the task edit modal via KanbanBoard's internal state isn't accessible here,
                    // so we render a standalone TaskModal
                    setGanttEditTask(task);
                  }}
                />
              )}
            </>
          )}
        </>
      )}

      {canSeeBudget && activeTab === 'budget' && <BudgetTab eventId={eventId} />}

      {activeTab === 'members' && (
        <div className="space-y-6">
          {/* Invite form — only for non-contributors (organizer/admin/manager) */}
          {!isProjectContributor && (
            <InviteMemberPanel eventId={eventId} onSuccess={() => membersQuery.refetch()} />
          )}

          {/* Current members list */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Membres actifs</h3>
            {membersQuery.isLoading ? (
              <p className="text-gray-500 text-sm">Chargement...</p>
            ) : members.length === 0 ? (
              <p className="text-gray-500 text-sm">Aucun membre invité pour ce projet.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      {m.user.avatar ? (
                        <img src={resolveMediaUrl(m.user.avatar)} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                          {m.user.firstName[0]}{m.user.lastName[0]}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{m.user.firstName} {m.user.lastName}</p>
                        <p className="text-xs text-gray-500">{m.user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${m.projectRole === 'MANAGER' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                        {m.projectRole === 'MANAGER' ? 'Responsable' : 'Collaborateur'}
                      </span>
                      {!isProjectContributor && (
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
                          title="Retirer du projet"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pending invitations */}
            {(membersQuery.data?.invitations ?? []).length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Invitations en attente</h4>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(membersQuery.data?.invitations ?? []).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{inv.firstName} {inv.lastName}</p>
                        <p className="text-xs text-gray-500">{inv.email}</p>
                      </div>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        En attente
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gantt view task edit modal */}
      {ganttEditTask && (
        <TaskModal
          eventId={eventId}
          task={ganttEditTask}
          onClose={() => setGanttEditTask(undefined)}
          members={members}
        />
      )}
    </div>
  );
}
