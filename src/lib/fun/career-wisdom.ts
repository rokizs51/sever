/**
 * Career wisdom — a mix of real advice, tongue-in-cheek observations,
 * and typewriter-flavored philosophy for the Sever. brand.
 *
 * Used by the dashboard tip carousel and the error boundary to sprinkle
 * a little delight into otherwise routine surfaces.
 */

export interface CareerTip {
  text: string;
  author: string;
  /** A tip with `fun: true` is our own invention, not a real attribution. */
  fun?: boolean;
}

export const CAREER_WISDOM: readonly CareerTip[] = [
  // --- The real ones (attributed loosely) ---
  {
    text: 'Your career is a jungle gym, not a ladder.',
    author: 'Sheryl Sandberg',
  },
  {
    text: "Bet on yourself. Every time you take a risk on your own abilities, the odds shift in your favor.",
    author: 'Unknown',
  },
  {
    text: 'The best time to look for a job is when you already have one.',
    author: 'Old recruiter proverb',
  },
  {
    text: "Show me your friends and I'll show you your future. Surround yourself with people who are going somewhere.",
    author: 'Unknown',
  },
  {
    text: 'Done is better than perfect.',
    author: 'Sheryl Sandberg',
  },
  {
    text: 'The only way to do great work is to love what you do.',
    author: 'Steve Jobs',
  },
  {
    text: "Your network is your net worth, but only if you actually talk to people in it.",
    author: 'Unknown',
  },

  // --- The fun ones (Sever. originals) ---
  {
    text: 'Every great developer was once rejected by at least one recruiter. Usually several.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: 'The best résumé is the one you never have to send because someone referred you.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: "If your cover letter starts with 'I am writing to express my interest,' start over.",
    author: 'Sever.',
    fun: true,
  },
  {
    text: '"Open to work" is a state of mind, not just a LinkedIn banner.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: 'Your git log is your real résumé. Everything else is marketing.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: 'The semicolon was optional, but your attention to detail should not be.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: 'Tailor your CV like a suit — off the rack rarely fits perfectly.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: "Imposter syndrome doesn't mean you're an imposter. It means you're growing.",
    author: 'Sever.',
    fun: true,
  },
  {
    text: 'Ship it. Then fix it. The best engineers are the ones who finish.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: "A rejection email is just a recruiter's way of saying 'not this Tuesday.'",
    author: 'Sever.',
    fun: true,
  },
  {
    text: 'The ATS does not hate you. It just really, really likes keywords.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: 'Your side project counts as experience. Your manager just forgot theirs did too.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: 'If you can explain Kubernetes to your grandmother, you can explain anything in an interview.',
    author: 'Sever.',
    fun: true,
  },
  {
    text: "Every 'We'll keep your résumé on file' is a polite fiction. Make them remember you instead.",
    author: 'Sever.',
    fun: true,
  },
] as const;

/** Pick a random career tip. Uses Math.random — not cryptographic, just playful. */
export function randomCareerTip(): CareerTip {
  return CAREER_WISDOM[Math.floor(Math.random() * CAREER_WISDOM.length)];
}
