import { type QueryKey, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { queryClient } from "@/app/_layout";

type TUseRQGlobalState<T> = {
  initialData?: T;
  queryKey: QueryKey;
};

export default function useRQGlobalState<T>({
  initialData = {} as T,
  queryKey,
}: TUseRQGlobalState<T>) {
  const { data } = useQuery({
    queryKey,
    queryFn: () => queryClient.getQueryData<T>(queryKey) ?? initialData,
    initialData,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const setNewData = useCallback(
    (newData: T) => {
      queryClient.setQueryData(queryKey, newData);
    },
    [queryKey],
  );

  return { data, setNewData };
}
