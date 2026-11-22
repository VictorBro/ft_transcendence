import { describe, expect, it } from 'vitest';
import { pickVoice, spokenText, type VoiceInfo } from './voice';

const voice = (lang: string, name: string, extra: Partial<VoiceInfo> = {}): VoiceInfo => ({
  lang,
  name,
  localService: true,
  default: false,
  ...extra,
});

const names = (voices: VoiceInfo[], lang: 'fr' | 'de' | 'en') => pickVoice(voices, lang)?.name;

describe('pickVoice', () => {
  it('is null when no voice speaks the language', () => {
    expect(pickVoice([], 'fr')).toBeNull();
    expect(pickVoice([voice('de-DE', 'Anna')], 'fr')).toBeNull();
  });

  it("puts the course's main region before any other", () => {
    const voices = [voice('fr-CA', 'Google français canadien'), voice('fr-FR', 'Compact')];
    expect(names(voices, 'fr')).toBe('Compact');
  });

  it('follows the order of the main regions: en-GB, then en-US', () => {
    const voices = [voice('en-US', 'Samantha'), voice('en-AU', 'Karen'), voice('en-GB', 'Kate')];
    expect(names(voices, 'en')).toBe('Kate');
  });

  it('takes another region when the main one is missing', () => {
    expect(names([voice('it-IT', 'Alice'), voice('fr-CH', 'Basic')], 'fr')).toBe('Basic');
  });

  it('reads the language from fr, fr-FR and fr_FR alike', () => {
    expect(names([voice('fr_FR', 'Underscore')], 'fr')).toBe('Underscore');
    expect(names([voice('FR', 'Bare')], 'fr')).toBe('Bare');
  });

  it('prefers a natural voice to a basic one of the same region', () => {
    const voices = [
      voice('fr-FR', 'eSpeak French'),
      voice('fr-FR', 'Google français', { localService: false }),
    ];
    expect(names(voices, 'fr')).toBe('Google français');
  });

  it.each(['Natural', 'Neural', 'Enhanced', 'Premium'])('takes %s as natural', (hint) => {
    const voices = [voice('de-DE', 'Basic'), voice('de-DE', `Stimme (${hint})`)];
    expect(names(voices, 'de')).toBe(`Stimme (${hint})`);
  });

  it('prefers a female voice, among the natural ones', () => {
    const voices = [
      voice('en-GB', 'Google UK English Male', { localService: false }),
      voice('en-GB', 'Google UK English Female', { localService: false }),
    ];
    expect(names(voices, 'en')).toBe('Google UK English Female');
    expect(
      names([voice('fr-FR', 'Thomas (Enhanced)'), voice('fr-FR', 'Audrey (Enhanced)')], 'fr'),
    ).toBe('Audrey (Enhanced)');
  });

  it('keeps a natural male voice over a basic female one', () => {
    const voices = [voice('de-DE', 'Anna'), voice('de-DE', 'Markus (Premium)')];
    expect(names(voices, 'de')).toBe('Markus (Premium)');
  });

  it('then prefers an online voice, then the default', () => {
    expect(names([voice('fr-FR', 'A'), voice('fr-FR', 'B', { localService: false })], 'fr')).toBe(
      'B',
    );
    expect(names([voice('fr-FR', 'A'), voice('fr-FR', 'B', { default: true })], 'fr')).toBe('B');
  });

  it('otherwise keeps the first one, as listed', () => {
    expect(names([voice('fr-FR', 'First'), voice('fr-FR', 'Second')], 'fr')).toBe('First');
  });
});

describe('spokenText', () => {
  it('leaves a plain sentence alone', () => {
    expect(spokenText("Bonjour, je m'appelle Léa.")).toBe("Bonjour, je m'appelle Léa.");
    expect(spokenText('Ne … que')).toBe('Ne … que');
  });

  it('reads a blank as a pause, not as underscores', () => {
    expect(spokenText('Je ___ français.')).toBe('Je, français.');
    expect(spokenText('___ bin müde.')).toBe('bin müde.');
  });

  it('drops the Markdown and the markup characters', () => {
    expect(spokenText('**Guten** _Tag_ `ja` # [x]')).toBe('Guten Tag ja x');
  });

  it('reads a slash as a choice', () => {
    expect(spokenText('tu / vous')).toBe('tu, vous');
  });

  it('is empty for a text with nothing to say', () => {
    expect(spokenText(' ___ ** ')).toBe('');
  });
});
