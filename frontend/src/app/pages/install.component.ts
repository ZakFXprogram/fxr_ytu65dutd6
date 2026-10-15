import { RouterLink } from '@angular/router';
import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-install',
  imports: [RouterLink],
  template: `
    <section class="wrap" style="padding-top:48px">
      <div class="center">
        <span class="chip">Setup guide</span>
        <h1 style="font-size:36px;margin:14px 0 10px">Install in MotiveWave</h1>
        <p class="mut" style="max-width:560px;margin:0 auto">FXR Loader is a small plugin that fetches the studies and checks your licence. You only install it once.</p>
      </div>
      <div class="center" style="margin:22px 0">
        <button class="btn" [class.btn-primary]="os()==='win'" [class.btn-ghost]="os()!=='win'" (click)="os.set('win')">Windows</button>
        <button class="btn" [class.btn-primary]="os()==='mac'" [class.btn-ghost]="os()!=='mac'" (click)="os.set('mac')" style="margin-left:8px">macOS</button>
      </div>
    </section>

    <section class="wrap section">
      <div class="card">
        <div class="steps">
          <div class="step"><h4>Get an active licence</h4><p class="mut" style="margin:0">Buy a plan on the <a routerLink="/pricing">pricing page</a>, then get your licence key from <a routerLink="/account">your account</a>.</p></div>
          <div class="step"><h4>Download FXR Loader</h4><p class="mut" style="margin:0">Grab <code>FXRLoader.jar</code> from the <strong>#downloads</strong> channel on our Discord.</p></div>
          <div class="step"><h4>Close MotiveWave</h4><p class="mut" style="margin:0">Fully quit MotiveWave before touching the extensions folder.</p></div>
          @if (os() === 'win') {
            <div class="step"><h4>Open the extensions folder</h4><p class="mut" style="margin:0">Press <code>Win + R</code>, paste <code>%USERPROFILE%\\MotiveWave Extensions</code> and press Enter.</p></div>
          } @else {
            <div class="step"><h4>Open the extensions folder</h4><p class="mut" style="margin:0">In Finder, press <code>⌘ + Shift + G</code> and go to <code>~/MotiveWave Extensions</code>.</p></div>
          }
          <div class="step"><h4>Copy the jar in</h4><p class="mut" style="margin:0">Put <code>FXRLoader.jar</code> in that folder. There must be only one copy.</p></div>
          <div class="step"><h4>Restart &amp; activate</h4><p class="mut" style="margin:0">Open MotiveWave, add any <strong>FXR</strong> study, and paste your licence key when asked. The studies unlock within seconds.</p></div>
        </div>
        <div class="notice" style="margin-top:18px">A licence runs on one computer. To move it to another machine, release it from <a routerLink="/account">your account</a> or ask support.</div>
      </div>
    </section>

    <section class="wrap section">
      <h3>Requirements</h3>
      <div class="grid g3" style="margin-top:12px">
        <div class="card"><strong>Tick data</strong><p class="mut" style="margin:6px 0 0;font-size:14px">A feed with bid/ask side (Rithmic recommended). Deep Trades also needs Market by Order on.</p></div>
        <div class="card"><strong>MotiveWave</strong><p class="mut" style="margin:6px 0 0;font-size:14px">Any recent version, on Windows or macOS, with the bundled Java.</p></div>
        <div class="card"><strong>Internet</strong><p class="mut" style="margin:6px 0 0;font-size:14px">FXR Loader checks your licence online when MotiveWave starts.</p></div>
      </div>
    </section>
  `,
})
export class InstallComponent {
  os = signal<'win' | 'mac'>('win');
}
