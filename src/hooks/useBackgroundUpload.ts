import { useEffect, useState, useCallback } from 'react';
import {
  backgroundUploadService,
  type UploadJob,
} from '../services/backgroundUploadService';

export function useBackgroundUpload() {
  const [jobs, setJobs] = useState<UploadJob[]>(
    () => backgroundUploadService.getActiveJobs(),
  );

  useEffect(() => {
    const listener = (job: UploadJob) => {
      setJobs(backgroundUploadService.getActiveJobs());
    };
    backgroundUploadService.addListener(listener);
    return () => backgroundUploadService.removeListener(listener);
  }, []);

  const getJob = useCallback(
    (id: string) => backgroundUploadService.getJob(id),
    [],
  );

  return { activeJobs: jobs, getJob };
}
