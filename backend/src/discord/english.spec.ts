import { englishName, slugOf } from './english';

const to = (n: string) => englishName(n).to;

describe('englishName', () => {
  it('translates channel names and keeps the emoji prefix', () => {
    expect(to('📥・téléchargements')).toBe('📥・downloads');
    expect(to('🆕・mises-à-jour')).toBe('🆕・updates');
    expect(to('📜・règles')).toBe('📜・rules');
    expect(to('💬・général')).toBe('💬・general');
    expect(to('👋・bienvenue')).toBe('👋・welcome');
    expect(to('les-règles')).toBe('rules');
  });
  it('leaves English names alone', () => {
    for (const n of ['❓・faq', '📈・trading', '📊・setups', '🆘・support', 'FXR Premium', 'Premium']) expect(to(n)).toBe(n);
  });
  it('keeps the case of categories and roles', () => {
    expect(to('📌 INFORMATIONS')).toBe('📌 INFORMATION');
    expect(to('COMMUNAUTÉ')).toBe('COMMUNITY');
    expect(to('Affilié')).toBe('Affiliate');
    expect(to('🔊 Salon vocal')).toBe('🔊 Voice');
  });
  it('reports accented words it does not know', () => {
    expect(englishName('🎯・élucubrations').unknown).toEqual(['élucubrations']);
  });
  it('gives a bare slug', () => {
    expect(slugOf('📥・téléchargements')).toBe('downloads');
    expect(slugOf('🆘・support')).toBe('support');
  });
});
