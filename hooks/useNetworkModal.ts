import { useCallback } from "react";
import useRQGlobalState from "./useRQGlobalState";

const QUERY_KEYS = {
  visible: ["networkModal", "visible"] as const,
  searchQuery: ["networkModal", "searchQuery"] as const,
};

export const useNetworkModal = () => {
  const { data: isVisible, setNewData: setVisible } = useRQGlobalState<boolean>(
    {
      queryKey: QUERY_KEYS.visible,
      initialData: false,
    },
  );

  const { data: searchQuery, setNewData: setSearchQuery } =
    useRQGlobalState<string>({
      queryKey: QUERY_KEYS.searchQuery,
      initialData: "",
    });

  const openModal = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const closeModal = useCallback(() => {
    setVisible(false);
    setSearchQuery("");
  }, [setVisible, setSearchQuery]);

  return {
    isVisible: isVisible ?? false,
    searchQuery: searchQuery ?? "",
    setSearchQuery,
    openModal,
    closeModal,
  };
};
