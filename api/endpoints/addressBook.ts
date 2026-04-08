import type {
  TCreateAddressBookDto,
  TUpdateAddressBookDto,
} from "@/api/types/addressBook";
import { apiCall } from "@/api/utils/api-helpers";
import { api } from "@/constants/configs/ky";
import type { TAddressBookEntry } from "@/constants/types/addressBookTypes";

export const addressBookApi = {
  getAll: () =>
    apiCall(
      () => api.get("address-book").json<TAddressBookEntry[]>(),
      "Failed to fetch address book",
    ),

  getById: (id: string) =>
    apiCall(
      () => api.get(`address-book/${id}`).json<TAddressBookEntry>(),
      "Failed to fetch contact",
    ),

  create: (dto: TCreateAddressBookDto) =>
    apiCall(
      () => api.post("address-book", { json: dto }).json<TAddressBookEntry>(),
      "Failed to create contact",
    ),

  update: (id: string, dto: TUpdateAddressBookDto) =>
    apiCall(
      () =>
        api
          .patch(`address-book/${id}`, { json: dto })
          .json<TAddressBookEntry>(),
      "Failed to update contact",
    ),

  remove: (id: string) =>
    apiCall(
      () => api.delete(`address-book/${id}`).then(() => undefined),
      "Failed to delete contact",
    ),
};
