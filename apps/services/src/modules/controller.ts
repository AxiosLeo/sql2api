import type { KoaContext } from '@axiosleo/koapp';
import { Controller } from '@axiosleo/koapp';

export class BaseController extends Controller {
  constructor() {
    super();
  }

  protected appId(context: KoaContext): string {
    const appId = context.auth?.app_id;
    if (!appId) {
      this.error(401, 'Unauthorized');
    }
    return appId!;
  }
}
