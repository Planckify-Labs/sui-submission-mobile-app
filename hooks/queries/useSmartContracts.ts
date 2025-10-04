import { useQuery } from "@tanstack/react-query";
import { smartContractApi } from "@/api/endpoints/smart-contracts";

export const useSmartContractByChain = (chainId: number) => {
  return useQuery({
    queryKey: ["smart-contracts", "chain", chainId],
    queryFn: () => smartContractApi.getSmartContractsByChain(chainId),
    enabled: !!chainId,
  });
};
