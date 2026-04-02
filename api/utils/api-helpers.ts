import type { KyInstance } from "ky";

type ApiOperation<T> = () => Promise<T>;
type SearchParams = Record<string, any>;

export const apiCall = async <T>(
  operation: ApiOperation<T>,
  errorMessage: string,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    console.error(errorMessage, error);
    throw error;
  }
};

export const buildSearchParams = (params: SearchParams): URLSearchParams => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value.toString());
    }
  });

  return searchParams;
};

export const fetchList = async <T>(
  api: KyInstance,
  endpoint: string,
  errorMessage: string,
): Promise<T> => {
  return apiCall(() => api.get(endpoint).json<T>(), errorMessage);
};

export const searchItems = async <T>(
  api: KyInstance,
  endpoint: string,
  params: SearchParams,
  errorMessage: string,
): Promise<T> => {
  return apiCall(() => {
    const searchParams = buildSearchParams(params);

    // Construct URL manually to ensure parameters are included
    const queryString = searchParams.toString();
    const fullUrl = queryString ? `${endpoint}?${queryString}` : endpoint;

    return api.get(fullUrl).json<T>();
  }, errorMessage);
};

export const fetchById = async <T>(
  api: KyInstance,
  endpoint: string,
  id: string,
  errorMessage: string,
): Promise<T> => {
  return apiCall(() => api.get(`${endpoint}/${id}`).json<T>(), errorMessage);
};

export const createItem = async <TReq, TRes>(
  api: KyInstance,
  endpoint: string,
  json: TReq,
  errorMessage: string,
): Promise<TRes> => {
  return apiCall(() => api.post(endpoint, { json }).json<TRes>(), errorMessage);
};
