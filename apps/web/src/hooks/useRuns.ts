import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runsApi } from '../api/runs';

export function useRuns(params?: {
  page?: number;
  pageSize?: number;
  collectorId?: string;
  sourceId?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ['runs', params],
    queryFn: () => runsApi.list(params),
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data &&
        data.data?.some(
          (r) =>
            r.status === 'RUNNING' ||
            r.status === 'PENDING' ||
            r.status === 'PAUSED' ||
            r.status === 'CANCEL_REQUESTED'
        )
      ) {
        return 1000; // Poll active runs every 1s for live real-time second counting
      }
      return 10000;
    },
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ['runs', id],
    queryFn: () => runsApi.get(id),
    enabled: !!id,
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data &&
        (data.status === 'RUNNING' ||
          data.status === 'PENDING' ||
          data.status === 'PAUSED' ||
          data.status === 'CANCEL_REQUESTED')
      ) {
        return 1000; // Poll active run detail every 1s for live real-time second counter
      }
      return false;
    },
  });
}

export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runsApi.cancel,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['runs', id] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usePauseRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runsApi.pause,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['runs', id] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useResumeRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runsApi.resume,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['runs', id] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useForceCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runsApi.forceCancel,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['runs', id] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useApproveRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runsApi.approve,
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['runs', variables.id] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRejectRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runsApi.reject,
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['runs', variables.id] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
