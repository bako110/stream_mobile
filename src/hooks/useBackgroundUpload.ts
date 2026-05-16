import { useEffect, useState, useCallback } from 'react';
import {
  backgroundUploadService,
  type UploadJob,
} from '../services/backgroundUploadService';

const DONE_LINGER_MS = 3000;

export function useBackgroundUpload() {
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const listener = (job: UploadJob) => {
      setJobs(prev => {
        const exists = prev.find(j => j.id === job.id);
        if (exists) {
          return prev.map(j => j.id === job.id ? job : j);
        }
        return [...prev, job];
      });

      // Retirer les jobs done/error après un délai pour laisser l'UI s'afficher
      if (job.status === 'done' || job.status === 'error') {
        clearTimeout(timers.get(job.id));
        const t = setTimeout(() => {
          setJobs(prev => prev.filter(j => j.id !== job.id));
          timers.delete(job.id);
        }, DONE_LINGER_MS);
        timers.set(job.id, t);
      }
    };

    backgroundUploadService.addListener(listener);
    return () => {
      backgroundUploadService.removeListener(listener);
      timers.forEach(t => clearTimeout(t));
    };
  }, []);

  const getJob = useCallback(
    (id: string) => backgroundUploadService.getJob(id),
    [],
  );

  const activeJobs = jobs.filter(j => j.status !== 'done' && j.status !== 'error');
  const visibleJobs = jobs; // inclut done/error pendant le délai

  return { activeJobs, visibleJobs, getJob };
}
