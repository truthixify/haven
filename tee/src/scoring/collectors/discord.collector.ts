import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DiscordActivity } from '../../common/types';

@Injectable()
export class DiscordCollector {
  private readonly logger = new Logger(DiscordCollector.name);

  async collect(accessToken: string): Promise<DiscordActivity | null> {
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };

      // Fetch user profile
      const profileRes = await axios.get('https://discord.com/api/v10/users/@me', { headers, timeout: 15_000 });
      const profile = profileRes.data;

      // Account age from snowflake ID
      const snowflake = BigInt(profile.id);
      const createdTimestamp = Number(snowflake >> 22n) + 1420070400000;
      const accountAge = Math.floor((Date.now() - createdTimestamp) / (1000 * 60 * 60 * 24));

      // Fetch guilds (servers)
      let guildCount = 0;
      try {
        const guildsRes = await axios.get('https://discord.com/api/v10/users/@me/guilds', { headers, timeout: 15_000 });
        guildCount = guildsRes.data?.length ?? 0;
      } catch {
        // guilds scope might not be available
      }

      // Fetch linked accounts (connections)
      let linkedAccountCount = 0;
      let linkedAccountProviders: string[] = [];
      try {
        const connectionsRes = await axios.get('https://discord.com/api/v10/users/@me/connections', { headers, timeout: 15_000 });
        const connections = connectionsRes.data ?? [];
        linkedAccountCount = connections.length;
        linkedAccountProviders = connections.map((c: any) => c.type);
      } catch {
        // connections scope might not be available
      }

      const hasNitro = (profile.premium_type ?? 0) > 0;

      const activity: DiscordActivity = {
        accountAge,
        guildCount,
        linkedAccountCount,
        linkedAccountProviders,
        hasNitro,
      };

      this.logger.debug(`Discord activity: age=${accountAge}d, guilds=${guildCount}, connections=${linkedAccountCount}`);

      return activity;
    } catch (error) {
      this.logger.error('Failed to collect Discord activity', error);
      return null;
    }
  }
}
