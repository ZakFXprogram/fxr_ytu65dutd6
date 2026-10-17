import { Controller, Post, Req, Res, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { InteractionsService } from './interactions.service';
import type { Interaction } from './commands';

/**
 * Discord's HTTP interactions endpoint. No cookies, no guard: every request is authenticated by its Ed25519
 * signature over the raw body. Discord validates this URL with a signed PING when you set it in the portal.
 */
@Controller('api/discord')
export class InteractionsController {
  constructor(private readonly svc: InteractionsService) {}

  @Post('interactions')
  @HttpCode(200)
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  handle(@Req() req: Request & { rawBody?: Buffer }, @Res({ passthrough: true }) res: Response): unknown {
    if (!this.svc.configured) {
      res.status(503);
      return { error: 'bot not configured' };
    }
    const sig = String(req.header('x-signature-ed25519') ?? '');
    const ts = String(req.header('x-signature-timestamp') ?? '');
    const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : req.rawBody;
    if (!raw || !this.svc.verify(sig, ts, raw)) {
      res.status(401);
      return { error: 'invalid request signature' };
    }
    let interaction: Interaction;
    try {
      interaction = JSON.parse(raw.toString('utf8')) as Interaction;
    } catch {
      res.status(400);
      return { error: 'bad request' };
    }
    return this.svc.handle(interaction);
  }
}
