'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File, preview: string) => void;
  onClear?: () => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  preview?: string;
  label?: string;
  description?: string;
  className?: string;
}

export function FileUpload({
  onFileSelect,
  onClear,
  accept = { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] },
  maxSize = 5 * 1024 * 1024,
  preview,
  label = 'Téléverser un fichier',
  description = 'PNG, JPG, JPEG jusqu\'à 5 Mo',
  className,
}: FileUploadProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setError(null);
      const file = acceptedFiles[0];
      if (!file) return;

      // Compress image via canvas before encoding — keeps base64 payload under ~500KB
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_WIDTH = 1200;
        const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.80);
        onFileSelect(file, compressed);
      };
      img.src = objectUrl;
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    maxFiles: 1,
    onDropRejected: (files) => {
      const err = files[0]?.errors[0];
      if (err?.code === 'file-too-large') setError('Fichier trop volumineux');
      else if (err?.code === 'file-invalid-type') setError('Type de fichier invalide');
      else setError('Échec du téléversement');
    },
  });

  return (
    <div className={cn('relative', className)}>
      <AnimatePresence>
        {preview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full h-48 rounded-xl overflow-hidden border-2 border-dashed border-indigo-200 dark:border-indigo-800 group"
          >
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClear?.(); }}
                className="p-2 bg-red-600 rounded-full text-white hover:bg-red-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div
              {...getRootProps()}
              className={cn(
                'w-full h-48 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200',
                isDragActive
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 scale-[1.02]'
                  : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              )}
            >
              <input {...getInputProps()} />
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                isDragActive ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-gray-100 dark:bg-gray-800'
              )}>
                {isDragActive ? (
                  <Upload className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDragActive ? 'Déposez le fichier ici' : label}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{description}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}
