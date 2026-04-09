import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { LinkedInActivity } from '../../common/types';

@Injectable()
export class LinkedInCollector {
  private readonly logger = new Logger(LinkedInCollector.name);

  async collect(accessToken: string): Promise<LinkedInActivity | null> {
    try {
      // LinkedIn OpenID Connect userinfo endpoint (free tier)
      const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15_000,
      });

      const profile = profileRes.data;

      const activity: LinkedInActivity = {
        hasProfile: !!profile?.sub,
        name: profile?.name ?? null,
        headline: profile?.headline ?? null,
      };

      this.logger.debug(`LinkedIn activity: hasProfile=${activity.hasProfile}, name=${activity.name}`);

      return activity;
    } catch (error) {
      this.logger.error('Failed to collect LinkedIn activity', error);
      return null;
    }
  }
}
