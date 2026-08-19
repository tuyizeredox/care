'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/empty-state';
import { toast } from '@/components/ui/sonner';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatBytes, formatRelative } from '@/lib/format';
import type { TaskAttachment } from '@/lib/types';
import { cn, fullName } from '@/lib/utils';

const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.jpg,.jpeg,.png,.gif,.webp,.zip';

/** Picks an icon from the extension so the list scans quickly. */
function iconFor(extension: string) {
  const ext = extension.toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return FileImage;
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return FileSpreadsheet;
  if (ext === '.zip') return FileArchive;
  return FileText;
}

export function TaskAttachments({
  taskId,
  taskNumber,
  attachments,
}: {
  taskId: string;
  taskNumber: number;
  attachments: TaskAttachment[];
}) {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TaskAttachment | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['task', taskNumber] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post('tasks/' + taskId + '/attachments', formData);
    },
    onSuccess: () => {
      toast.success('File uploaded');
      void refresh();
    },
    onError: (error) => {
      toast.error('Unable to upload attachment', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete('attachments/' + id),
    onSuccess: () => {
      toast.success('File removed');
      setPendingDelete(null);
      void refresh();
    },
    onError: (error) => {
      toast.error('Unable to remove the file', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    },
  });

  const download = async (attachment: TaskAttachment) => {
    try {
      await api.download('attachments/' + attachment.id + '/download');
    } catch (error) {
      toast.error('Unable to open the file', {
        description: error instanceof ApiError ? error.message : 'Please try again.',
      });
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => upload.mutate(file));
  };

  const canUpload = can('upload_attachment');

  return (
    <div className="space-y-3">
      {canUpload ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center rounded border border-dashed px-4 py-6 text-center transition-colors',
            dragging ? 'border-primary bg-primary/[0.04]' : 'bg-muted/20',
          )}
        >
          <Upload className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-sm">
            Drop files here, or{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => inputRef.current?.click()}
            >
              browse
            </button>
          </p>
          <p className="mt-1 text-2xs text-muted-foreground">
            PDF, Word, Excel, PowerPoint, images, CSV and ZIP. Maximum 25 MB per file.
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="sr-only"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
          {upload.isPending ? (
            <p className="mt-2 text-xs text-muted-foreground">Uploading…</p>
          ) : null}
        </div>
      ) : null}

      {attachments.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="No attachments"
          description={canUpload ? 'Attach supporting documents so reviewers have what they need.' : undefined}
        />
      ) : (
        <ul className="divide-y rounded border">
          {attachments.map((attachment) => {
            const Icon = iconFor(attachment.extension);
            const mayDelete =
              can('delete_attachment') || attachment.uploadedBy.id === user?.id;

            return (
              <li key={attachment.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {formatBytes(attachment.sizeBytes)} · {fullName(attachment.uploadedBy)} ·{' '}
                    {formatRelative(attachment.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void download(attachment)}
                  aria-label={'Download ' + attachment.fileName}
                >
                  <Download className="h-4 w-4" aria-hidden />
                </Button>
                {mayDelete ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPendingDelete(attachment)}
                    aria-label={'Remove ' + attachment.fileName}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.fileName} will be removed from the task. The task history keeps a
              record that it was uploaded and removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              Remove file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
