import { Injectable } from '@nestjs/common';

@Injectable()
export class LoginRateLimitService {
  private readonly attempts = new Map<string, number[]>();

  consume(key: string, now = Date.now()): boolean {
    const windowStart = now - 15 * 60 * 1000;
    const recent = (this.attempts.get(key) ?? []).filter((attempt) => attempt > windowStart);
    if (recent.length >= 5) return false;
    recent.push(now);
    this.attempts.set(key, recent);
    return true;
  }
}
