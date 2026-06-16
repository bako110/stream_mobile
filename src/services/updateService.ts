import { apiClient } from '../api';
import { Endpoints } from '../api/endpoints';

export interface AppVersionInfo {
  version_name: string;
  version_code: number;
  apk_url: string | null;
  force_update: boolean;
  changelog: string | null;
}

export const updateService = {
  async checkForUpdate(): Promise<AppVersionInfo> {
    const { data } = await apiClient.get<AppVersionInfo>(Endpoints.app.version);
    return data;
  },
};
