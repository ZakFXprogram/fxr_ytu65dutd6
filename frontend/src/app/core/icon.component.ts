import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Small stroke icon set (24px grid), drawn inline so it follows currentColor. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:inline-flex' },
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (name()) {
        @case ('tick') { <path d="M3 17l5-6 4 3 4-7 5 6" /><circle cx="16" cy="7" r="1.6" /> }
        @case ('layers') { <path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /> }
        @case ('bolt') { <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /> }
        @case ('chat') { <path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.4A8 8 0 1 1 21 12z" /><path d="M9 11h.01M12 11h.01M15 11h.01" /> }
        @case ('arrow') { <path d="M5 12h14M13 6l6 6-6 6" /> }
        @case ('check') { <path d="M5 12l5 5 9-10" /> }
        @case ('lock') { <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /> }
        @case ('home') { <path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /> }
        @case ('wallet') { <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M21 9h-6a3 3 0 0 0 0 6h6V9z" /><path d="M16 12h.01" /> }
        @case ('clock') { <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /> }
        @case ('card') { <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /> }
        @case ('key') { <circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M15 8l2 2" /> }
        @case ('gift') { <rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z" /> }
        @case ('shield') { <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /> }
        @case ('logout') { <path d="M15 4h4v16h-4M10 17l-5-5 5-5M5 12h11" /> }
        @case ('search') { <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /> }
        @case ('download') { <path d="M12 4v11M7 10l5 5 5-5M5 20h14" /> }
        @case ('refresh') { <path d="M20 11a8 8 0 0 0-14-5L4 8M4 13a8 8 0 0 0 14 5l2-2" /><path d="M4 4v4h4M20 20v-4h-4" /> }
        @case ('users') { <circle cx="9" cy="8" r="3.5" /><path d="M2 20c.5-4 3.5-6 7-6s6.5 2 7 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20c-.3-2.6-1.7-4.4-4-5.3" /> }
        @case ('ticket') { <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4V8z" /><path d="M14 6v14" stroke-dasharray="2 2.5" /> }
        @case ('activity') { <path d="M3 12h4l3 8 4-16 3 8h4" /> }
        @case ('receipt') { <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /> }
        @case ('monitor') { <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /> }
        @case ('phone') { <rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /> }
        @case ('copy') { <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /> }
        @case ('external') { <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /> }
        @case ('chart') { <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> }
        @case ('alert') { <path d="M12 3l10 18H2L12 3z" /><path d="M12 10v4M12 17h.01" /> }
        @case ('mail') { <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /> }
        @case ('x') { <path d="M6 6l12 12M18 6L6 18" /> }
        @default { <circle cx="12" cy="12" r="8" /> }
      }
    </svg>
  `,
})
export class IconComponent {
  name = input.required<string>();
}
