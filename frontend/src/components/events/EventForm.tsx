'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Calendar, Loader2, MapPin, Users, Building } from 'lucide-react';
import { createEventSchema, type CreateEventFormData } from '@/lib/validations';
import { useCreateEvent, useUpdateEvent } from '@/hooks/useEvents';
import { FileUpload } from '@/components/common/FileUpload';
import type { Event } from '@/types';
import { cn } from '@/lib/utils';

interface EventFormProps {
  event?: Event;
  isEdit?: boolean;
}

function Field({
  label, error, children, required,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

const inputClass = 'w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all';

// Convert a local datetime-local string to an ISO string for the API
function toISOString(local: string): string {
  if (!local) return '';
  // datetime-local format: "2026-06-20T14:00" — treat as local time
  return new Date(local).toISOString();
}

// Convert an ISO string to datetime-local format for the input
function toLocalDateTime(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 16); // "2026-06-20T14:00"
}

export function EventForm({ event, isEdit }: EventFormProps) {
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(event?.id ?? '');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateEventFormData>({
    resolver: zodResolver(createEventSchema),
    defaultValues: event
      ? {
          name: event.name,
          description: event.description,
          venue: event.venue,
          address: event.address,
          city: event.city,
          country: event.country,
          startDate: toLocalDateTime(event.startDate),
          endDate: toLocalDateTime(event.endDate),
          totalCapacity: event.totalCapacity,
          bannerUrl: event.bannerUrl,
        }
      : { totalCapacity: 100 },
  });

  const bannerUrl = watch('bannerUrl');

  const onSubmit = (data: CreateEventFormData) => {
    const payload = {
      ...data,
      startDate: toISOString(data.startDate),
      endDate: toISOString(data.endDate),
    };
    if (isEdit && event) {
      updateEvent.mutate(payload);
    } else {
      createEvent.mutate(payload);
    }
  };

  const isPending = isEdit ? updateEvent.isPending : createEvent.isPending;

  return (
    <motion.form
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-5">
          <Field label="Event Name" error={errors.name?.message} required>
            <input {...register('name')} placeholder="Tech Conference 2026" className={inputClass} />
          </Field>

          <Field label="Description" error={errors.description?.message}>
            <textarea
              {...register('description')}
              rows={4}
              placeholder="Describe your event..."
              className={cn(inputClass, 'resize-none')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" error={errors.startDate?.message} required>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  {...register('startDate')}
                  type="datetime-local"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
            </Field>
            <Field label="End Date" error={errors.endDate?.message} required>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  {...register('endDate')}
                  type="datetime-local"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
            </Field>
          </div>

          <Field label="Venue" error={errors.venue?.message} required>
            <div className="relative">
              <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                {...register('venue')}
                placeholder="Grand Convention Center"
                className={cn(inputClass, 'pl-9')}
              />
            </div>
          </Field>

          <Field label="Address" error={errors.address?.message}>
            <input {...register('address')} placeholder="123 Main Street (optional)" className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City" error={errors.city?.message} required>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  {...register('city')}
                  placeholder="Paris"
                  className={cn(inputClass, 'pl-9')}
                />
              </div>
            </Field>
            <Field label="Country" error={errors.country?.message} required>
              <input {...register('country')} placeholder="France" className={inputClass} />
            </Field>
          </div>

          <Field label="Capacity" error={errors.totalCapacity?.message} required>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <input
                {...register('totalCapacity', { valueAsNumber: true })}
                type="number"
                min={1}
                placeholder="500"
                className={cn(inputClass, 'pl-9')}
              />
            </div>
          </Field>
        </div>

        {/* Right column — cover image */}
        <div className="space-y-5">
          <Field label="Cover Image" error={errors.bannerUrl?.message}>
            <FileUpload
              preview={bannerUrl}
              onFileSelect={(_, preview) => setValue('bannerUrl', preview)}
              onClear={() => setValue('bannerUrl', '')}
              label="Upload event cover"
              description="Recommended: 1200×630px, max 5MB"
            />
          </Field>

          {bannerUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Preview</p>
              <img src={bannerUrl} alt="Cover" className="w-full h-48 object-cover rounded-lg" />
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
        <a
          href="/dashboard/events"
          className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary gap-2 min-w-[120px]"
        >
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />{isEdit ? 'Saving...' : 'Creating...'}</>
          ) : (
            isEdit ? 'Save Changes' : 'Create Event'
          )}
        </button>
      </div>
    </motion.form>
  );
}
