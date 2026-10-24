import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiService, apiError, type BotStatus, type BotPost } from '../../core/api.service';

/**
 * Discord bot controls (the FXR Manager replacement): register the slash commands, publish/refresh the channel
 * guides, publish the Loader jar to #téléchargements, and run the expiry reminders. Every action is manual.
 */
@Component({
  selector: 'app-panel-discord',
  imports: [FormsModule],
  template: `
    <div style="display:block;margin-top:18px">
      @if (status(); as s) {
        <!-- wiring -->
        <div class="card" style="padding:16px">
          <h3 style="margin:0 0 10px">Configuration</h3>
          <div class="grid2">
            <span>Bot (token + serveur)</span><b [class.ok]="s.botConfigured" [class.no]="!s.botConfigured">{{ s.botConfigured ? 'OK' : 'manquant' }}</b>
            <span>App ID</span><b [class.ok]="s.appId" [class.no]="!s.appId">{{ s.appId ? 'OK' : 'manquant' }}</b>
            <span>Clé publique (interactions)</span><b [class.ok]="s.publicKey" [class.no]="!s.publicKey">{{ s.publicKey ? 'OK' : 'manquant' }}</b>
            <span>Rôle Premium</span><b [class.ok]="s.memberRole" [class.no]="!s.memberRole">{{ s.memberRole ? 'OK' : 'manquant' }}</b>
            <span>Rôle Affilié</span><b [class.ok]="s.affiliateRole">{{ s.affiliateRole ? 'OK' : 'non configuré' }}</b>
            <span>Salon #téléchargements</span><b [class.ok]="s.downloadsChannel">{{ s.downloadsChannel ? 'OK' : 'non configuré' }}</b>
          </div>
          <p class="mut small" style="margin:12px 0 4px">URL d'interactions (à coller dans le portail Discord → app FXR → Interactions Endpoint URL) :</p>
          <code class="copyable" (click)="copy(s.interactionsUrl)">{{ s.interactionsUrl }}</code>
        </div>

        <!-- commands -->
        <div class="card" style="padding:16px;margin-top:14px">
          <h3 style="margin:0 0 6px">Commandes slash</h3>
          <p class="mut small" style="margin:0 0 10px">(Ré)enregistre /license, /key, /activate et /my-license sur le serveur. À faire une fois (et après chaque changement).</p>
          <button class="btn btn-sm" [disabled]="busy()" (click)="register()">Enregistrer les commandes</button>
        </div>

        <!-- invite -->
        <div class="card" style="padding:16px;margin-top:14px">
          <h3 style="margin:0 0 6px">Invitation du serveur</h3>
          <p class="mut small" style="margin:0 0 10px">Crée une invitation <strong>par le bot</strong> (affichée « Invité par FXR », sans ton nom). Le site l'utilise ensuite partout. Le bot a besoin de la permission « Créer une invitation ».</p>
          <div class="postact" style="margin-bottom:8px">
            <input [(ngModel)]="inviteChannel" placeholder="ID d'un salon public (défaut : #téléchargements)" class="inp-sm" style="width:260px" />
            <button class="btn btn-sm" [disabled]="busy()" (click)="createInvite()">Créer l'invitation</button>
          </div>
          @if (s.invite) {
            <div>Actuelle @if (!s.botInvite) { <span class="small faint">(créée par toi — remplace-la)</span> } :
              <code class="copyable" (click)="copy(s.invite)">{{ s.invite }}</code>
            </div>
          }
        </div>

        <!-- jar -->
        <div class="card" style="padding:16px;margin-top:14px">
          <h3 style="margin:0 0 6px">Publier le jar</h3>
          <p class="mut small" style="margin:0 0 10px">Patche le jar Loader avec la config du serveur et le publie dans #téléchargements (remplace la version précédente).</p>
          <button class="btn btn-sm" [disabled]="busy() || !s.downloadsChannel" (click)="publishJar()">Publier FXROrderFlow.jar</button>
        </div>

        <!-- posts -->
        <div class="card" style="padding:16px;margin-top:14px">
          <h3 style="margin:0 0 10px">Messages de canaux</h3>
          @for (p of posts(); track p.id) {
            <div class="postrow">
              <div><b>{{ p.title }}</b> @if (p.posted) { <span class="small faint">· publié</span> }</div>
              <div class="postact">
                <input [(ngModel)]="channel[p.id]" placeholder="ID du salon" class="inp-sm" />
                <button class="btn btn-ghost btn-sm" [disabled]="busy() || !channel[p.id]" (click)="publishPost(p.id)">{{ p.posted ? 'Mettre à jour' : 'Publier' }}</button>
              </div>
            </div>
          }
        </div>

        <!-- reminders -->
        <div class="card" style="padding:16px;margin-top:14px">
          <h3 style="margin:0 0 6px">Rappels d'expiration</h3>
          <p class="mut small" style="margin:0 0 10px">Envoie maintenant un DM aux membres dont la licence expire bientôt (si activé via DISCORD_REMINDER_DAYS).</p>
          <button class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="runReminders()">Lancer les rappels</button>
        </div>

        @if (msg()) { <p class="note" style="margin-top:14px">{{ msg() }}</p> }
        @if (err()) { <p class="errbox" style="margin-top:14px">{{ err() }}</p> }
      } @else {
        <p class="mut">…</p>
      }
    </div>
  `,
  styles: [`
    .grid2 { display:grid; grid-template-columns:1fr auto; gap:6px 16px; align-items:center; font-size:14px; }
    .grid2 b.ok { color:#2ecc71; } .grid2 b.no { color:#e74c3c; } .grid2 b { color:#95a5a6; }
    code.copyable { display:inline-block; cursor:pointer; padding:7px 10px; background:#0d1117; border:1px solid #2b3240; border-radius:6px; font-size:12px; word-break:break-all; }
    .postrow { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-top:1px solid #1c2230; flex-wrap:wrap; }
    .postrow:first-of-type { border-top:0; }
    .postact { display:flex; gap:8px; align-items:center; }
    .inp-sm { width:170px; padding:6px 8px; font-size:12px; background:#0d1117; border:1px solid #2b3240; border-radius:6px; color:inherit; }
    .note { color:#2ecc71; }
  `],
})
export class PanelDiscordComponent {
  private api = inject(ApiService);
  status = signal<BotStatus | null>(null);
  posts = signal<BotPost[]>([]);
  channel: Record<string, string> = {};
  inviteChannel = '';
  busy = signal(false);
  msg = signal('');
  err = signal('');

  constructor() {
    this.reload();
  }

  private reload(): void {
    this.api.botStatus().subscribe({ next: (s) => this.status.set(s), error: () => this.status.set(null) });
    this.api.botPosts().subscribe({ next: (p) => this.posts.set(p), error: () => {} });
  }

  private run<T>(obs: Observable<T>, ok: (v: T) => string): void {
    this.busy.set(true);
    this.msg.set('');
    this.err.set('');
    obs.subscribe({
      next: (v) => { this.busy.set(false); this.msg.set(ok(v)); this.reload(); },
      error: (e) => { this.busy.set(false); this.err.set(apiError(e)); },
    });
  }

  register(): void {
    this.run(this.api.registerCommands(), (r) => (r.ok ? `✅ ${r.count} commandes enregistrées.` : '⚠️ ' + (r.error ?? 'échec')));
  }
  publishJar(): void {
    this.run(this.api.publishJar(), (r) => `✅ Jar v${r.version} publié.`);
  }
  createInvite(): void {
    this.run(this.api.createInvite(this.inviteChannel.trim() || undefined), (r) => `✅ Invitation créée : ${r.url}`);
  }
  publishPost(id: string): void {
    this.run(this.api.publishPost(id, (this.channel[id] || '').trim()), (r) => (r.edited ? '✅ Message mis à jour.' : '✅ Message publié.'));
  }
  runReminders(): void {
    this.run(this.api.runReminders(), (r) => (r.ok ? `✅ ${r.sent} rappel(s) envoyé(s), ${r.failed} en échec.` : '⚠️ ' + (r.error ?? 'désactivé')));
  }
  copy(text: string): void {
    void navigator.clipboard?.writeText(text);
    this.msg.set('URL copiée.');
  }
}
