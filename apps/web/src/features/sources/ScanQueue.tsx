import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueries } from '@tanstack/react-query';
import type { JobView, Source } from '@shared/contracts';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/ui';
import { api, post, refreshData } from '../../lib/api';
import { useDateFormat } from '../../lib/date-context';

export function useScanQueue() {
  const [tracked, setTracked] = useState<{ job: JobView; sourceName: string }[]>([]);
  const completed = useRef(new Set<string>());
  const toast = useToast();
  const request = useMutation({
    mutationFn: async (sources: Source[]) =>
      Promise.allSettled(
        sources.map(async (source) => ({
          job: await post<JobView>(`/sources/${source.id}/check`, undefined, {
            'Idempotency-Key': crypto.randomUUID(),
          }),
          sourceName: source.name,
        })),
      ),
    onSuccess: async (results) => {
      const received = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      const failures = results.filter((result) => result.status === 'rejected');
      setTracked((previous) => [
        ...previous.filter((p) => !received.some((r) => r.job.id === p.job.id)),
        ...received,
      ]);
      if (received.length) toast(`${received.length} kaynak için kontrol sıraya alındı.`);
      if (failures.length)
        toast(
          failures[0].reason instanceof Error
            ? failures[0].reason.message
            : `${failures.length} kaynak sıraya alınamadı.`,
          'error',
        );
      await refreshData();
    },
  });
  const queries = useQueries({
    queries: tracked.map((row) => ({
      queryKey: ['job', row.job.id],
      queryFn: () => api<JobView>(`/jobs/${row.job.id}`),
      refetchInterval: (query: { state: { data: JobView | undefined } }) =>
        !query.state.data || ['queued', 'running'].includes(query.state.data.status)
          ? 1500
          : (false as const),
    })),
  });
  const rows = tracked.map((row, i) => ({
    ...row,
    job: queries[i]?.data ?? row.job,
    error: queries[i]?.error?.message,
  }));
  const completionKey = rows
    .filter((row) => ['completed', 'failed'].includes(row.job.status))
    .map((row) => row.job.id)
    .join(',');
  useEffect(() => {
    const ids = completionKey
      .split(',')
      .filter(Boolean)
      .filter((id) => !completed.current.has(id));
    if (ids.length) {
      ids.forEach((id) => completed.current.add(id));
      void refreshData();
    }
  }, [completionKey]);
  return {
    request,
    rows,
    dismiss: () =>
      setTracked((previous) =>
        previous.filter(
          (row) =>
            !rows.some(
              (r) => r.job.id === row.job.id && ['completed', 'failed'].includes(r.job.status),
            ),
        ),
      ),
  };
}
export function ScanQueue({ queue }: { queue: ReturnType<typeof useScanQueue> }) {
  const { formatTime } = useDateFormat();
  if (!queue.rows.length) return null;
  const complete = queue.rows.every((row) => ['completed', 'failed'].includes(row.job.status));
  const labels: Record<JobView['status'], string> = {
    queued: 'Sırada',
    running: 'Kontrol ediliyor',
    completed: 'Kontrol tamamlandı',
    failed: 'Kontrol başarısız',
  };
  return (
    <section className="scan-queue" aria-label="Tarama kuyruğu" aria-live="polite">
      <div className="scan-queue-heading">
        <span>
          <Icon name="Activity" size={16} />
          Tarama kuyruğu
        </span>
        {complete && (
          <button
            className="icon-button"
            onClick={queue.dismiss}
            aria-label="Tamamlanan taramaları kapat"
          >
            <Icon name="X" size={15} />
          </button>
        )}
      </div>
      {queue.rows.map(({ job, sourceName, error }) => (
        <div className={`scan-job ${job.status}`} key={job.id}>
          <Icon
            name={
              job.status === 'running'
                ? 'LoaderCircle'
                : job.status === 'completed'
                  ? 'CheckCircle2'
                  : job.status === 'failed'
                    ? 'AlertCircle'
                    : 'Clock3'
            }
            className={job.status === 'running' ? 'spin' : ''}
            size={15}
          />
          <strong>{sourceName}</strong>
          <span>
            {error ?? labels[job.status]}
            {job.status === 'queued' ? ` · ${formatTime(job.nextAttemptAt)}` : ''}
          </span>
          {job.delayReason && <small>{job.delayReason}</small>}
        </div>
      ))}
    </section>
  );
}
