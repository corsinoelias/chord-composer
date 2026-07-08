export interface Progression {
  title: string;
  chords: string;
  bpm: number;
  style: string;
  description: string;
  // Deep-links to /tools/scales/ preselected to the scale that fits this progression,
  // e.g. { root: 4, scaleName: 'Blues Minor Scale', label: 'E Blues Scale' }
  scale?: { root: number; scaleName: string; label: string };
}

export interface RelatedArticle {
  href: string;
  label: string;
  description: string;
}

export interface QAItem {
  question: string;
  answer: string;
}

export interface Genre {
  slug: string;
  name: string;
  description: string;
  metaDescription: string;
  // Overrides the default "{name} Chord Progression Generator" H1/<title> when set
  pageTitle?: string;
  editorialIntro?: string[];
  editorialQA?: QAItem[];
  progressions: Progression[];
  learnLink?: { href: string; label: string };
  relatedArticles?: RelatedArticle[];
  learnSectionTitle?: string;
  faq?: QAItem[];
}

export const GENRES: Genre[] = [
  {
    slug: 'pop',
    name: 'Pop',
    description: 'The most widely used chord progressions in modern pop music.',
    metaDescription: 'Explore the most common pop chord progressions: I–V–vi–IV, vi–IV–I–V, and more. Play them instantly in your browser with Chord Sequence.',
    editorialIntro: [
      'Pop music is built on a small set of chord progressions that repeat across decades and genres. The reason is simple: these progressions work. They create a cycle of tension and resolution that feels natural to the human ear because they mirror the harmonic language we have absorbed since childhood.',
      'The I–V–vi–IV progression — C, G, Am, F in C major — is the most recorded harmonic pattern in modern music. You can hear it in "Let It Be," "No Woman No Cry," "Africa," and thousands of other songs spanning five decades. It works because the vi minor chord creates a brief moment of emotional shadow before the IV and V pull the listener back to the tonic. That contrast is what makes pop progressions feel simultaneously familiar and emotionally engaging.',
      'The best way to understand these progressions is to play them in different keys, at different tempos, and with different rhythmic feels. The same four chords played as a ballad, a driving rock beat, or a syncopated funk groove sound like completely different songs. Use the interactive players below to explore each one, and try opening them in the editor to change the key or layering.',
      'The 50s progression — I–vi–IV–V — predates the Axis by two decades but remains equally effective. You hear it in "Stand By Me," "Earth Angel," and hundreds of early rock and roll songs. The difference between the two is emotional coloring: the Axis begins on the tonic and creates a cycle of resolution and wistfulness, while the 50s progression keeps the vi chord in an earlier position, giving the sequence a nostalgic, romantic quality. Transposing any of these progressions to a new key is the fastest way to develop your harmonic ear — the same four chords in C major sound bright and open, while the same pattern in Eb major sounds closer and more intimate.',
    ],
    learnLink: { href: '/learn/chord-progressions-for-beginners/', label: 'Read the beginner\'s guide to chord progressions →' },
    learnSectionTitle: 'Learn pop songwriting',
    relatedArticles: [
      { href: '/learn/chord-progressions-for-beginners/', label: 'Chord progressions for beginners', description: 'The most common pop progressions with playable examples and theory explained' },
      { href: '/learn/what-is-a-chord-progression/', label: 'What is a chord progression?', description: 'How chords work together and why some combinations always sound right' },
    ],
    progressions: [
      { title: 'I–V–vi–IV (The Axis)', chords: 'C G Am F', bpm: 110, style: 'pop_basic', description: 'The most recorded progression in modern pop. Heard in hundreds of hits.' },
      { title: 'vi–IV–I–V', chords: 'Am F C G', bpm: 100, style: 'pop_basic', description: 'Same chords as the Axis, but starting on vi gives a more melancholic feel.' },
      { title: 'I–IV–V', chords: 'C F G', bpm: 120, style: 'pop_basic', description: 'Three-chord foundation of pop, rock, and folk.' },
      { title: 'I–V–vi–iii–IV', chords: 'C G Am Em F', bpm: 105, style: 'pop_basic', description: 'Five-chord variation adding the iii for extra harmonic color.' },
      { title: 'I–IV–vi–V', chords: 'C F Am G', bpm: 108, style: 'pop_basic', description: 'Builds tension through the IV before resolving on V.' },
      { title: 'I–vi–IV–V (50s Progression)', chords: 'C Am F G', bpm: 115, style: 'pop_basic', description: 'Classic doo-wop and early rock staple. Romantic and timeless.' },
    ],
  },
  {
    slug: 'jazz',
    name: 'Jazz',
    description: 'Essential jazz chord progressions — from the ii–V–I cornerstone to bossa nova, jazz blues, and modal harmony.',
    metaDescription: 'Play and learn essential jazz chord progressions: ii–V–I, jazz turnarounds, bossa nova, jazz blues, modal jazz, and more. Interactive players — no signup required.',
    editorialIntro: [
      'From the ii–V–I cornerstone to bossa nova, jazz blues, and modal vamps — these are the progressions that show up in virtually every jazz standard. Press play on each one below to hear how the chords move, then head to the full guide for the theory behind why they work.',
    ],
    learnLink: { href: '/learn/jazz-chord-progressions/', label: 'Read the complete jazz chord progressions guide →' },
    learnSectionTitle: 'Learn jazz harmony',
    relatedArticles: [
      { href: '/learn/jazz-chord-progressions/', label: 'Jazz chord progressions', description: 'ii–V–I, tritone substitution, and the jazz blues explained with interactive examples' },
      { href: '/learn/circle-of-fifths-explained/', label: 'Circle of fifths explained', description: 'How key relationships work and why jazz progressions follow the circle' },
    ],
    progressions: [
      { title: 'ii–V–I', chords: 'Dm7 G7 Cmaj7', bpm: 120, style: 'pop_basic', description: 'The cornerstone of jazz harmony. Used in virtually every jazz standard ever written.' },
      { title: 'I–VI–ii–V (Turnaround)', chords: 'Cmaj7 A7 Dm7 G7', bpm: 130, style: 'pop_basic', description: 'Classic jazz turnaround used to loop back to the top of any standard.' },
      { title: 'ii–V–I–VI (Extended)', chords: 'Dm7 G7 Cmaj7 A7', bpm: 120, style: 'pop_basic', description: 'Extends the ii–V–I with a VI7 that pulls the ear back to the beginning.' },
      { title: 'iii–VI–ii–V (Cycle)', chords: 'Em7 A7 Dm7 G7', bpm: 140, style: 'pop_basic', description: 'A cycle-of-fifths chain of dominants. The backbone of bebop harmony.' },
      { title: 'Jazz Blues', chords: 'C7 F7 C7 G7 F7 C7', bpm: 120, style: 'pop_basic', description: 'The 12-bar blues with jazz seventh chords. Parker, Rollins, Coltrane all started here.' },
      { title: 'Bossa Nova Loop', chords: 'Cmaj7 Am7 Dm7 G7', bpm: 80, style: 'pop_basic', description: 'Jobim-style major seventh harmony at a relaxed bossa nova tempo.' },
      { title: 'Descending Bossa Nova', chords: 'Fmaj7 Em7 Am7 Dm7 G7 Cmaj7', bpm: 75, style: 'pop_basic', description: 'Flowing cycle-of-fifths movement — the classic Jobim sound.' },
      { title: 'Minor ii–V–i', chords: 'Dm7 G7 Cm7', bpm: 120, style: 'pop_basic', description: 'The minor key ii–V–I. Essential for Autumn Leaves, Summertime, and minor standards.' },
      { title: 'Dorian Modal Vamp', chords: 'Dm7 Em7 Fmaj7 Em7', bpm: 110, style: 'pop_basic', description: 'Miles Davis "So What" style modal jazz. Two chords, infinite space.' },
      { title: 'Cycle of Fifths', chords: 'Em7 A7 Dm7 G7 Cmaj7', bpm: 130, style: 'pop_basic', description: 'Descending through the circle of fifths. The skeleton of Autumn Leaves.' },
      { title: 'I–IV–iii–VI (Bird Blues)', chords: 'Cmaj7 Fmaj7 Em7 A7', bpm: 130, style: 'pop_basic', description: 'Charlie Parker style reharmonization — Bird Blues opening changes.' },
      { title: 'Neo Soul Jazz', chords: 'Dm9 G13 Cmaj9 Am9', bpm: 88, style: 'pop_basic', description: 'Extended ninth and thirteenth chords for a modern jazz-R&B crossover feel.' },
    ],
  },
  {
    slug: 'lo-fi',
    name: 'Lo-fi',
    description: 'Chill, jazzy progressions for lo-fi hip-hop, study beats, and bedroom pop.',
    metaDescription: 'Lo-fi chord progressions for study beats and chill music. Cmaj7, Am7, Fmaj7 and more — play them instantly in your browser.',
    editorialIntro: [
      'Lo-fi music is defined less by its chord progressions and more by the way those progressions are played — slow tempos, warm extended chords, and a production aesthetic that intentionally embraces imperfection. But the harmony is the foundation. Lo-fi producers almost universally reach for major seventh and minor seventh chords instead of bare triads, because the added seventh softens the edges and creates that characteristic floating, unfocused quality.',
      'The most common lo-fi progressions are simple: a four-chord loop in a major or minor key, often borrowed from jazz harmony, played at 70–85 BPM. The Cmaj7–Am7–Fmaj7–G7 loop that defines thousands of study beat tracks is structurally identical to a standard pop progression — the difference is the chord voicing, the tempo, and the texture. Seventh chords in close voicings, played on piano or Rhodes, with a slightly out-of-tune sample and tape hiss layered over the top, is the lo-fi formula.',
      'If you want to write lo-fi music, start with a minor or major ii–V–I and slow it down. Add major sevenths to every chord you can. Use the minor iv chord (borrowed from the parallel minor key) for emotional weight — in C major, that means Fm instead of F. The progressions below cover the most useful lo-fi patterns. Open any of them in the editor and try dropping the tempo to 72 BPM to hear how the groove transforms.',
    ],
    learnLink: { href: '/learn/music-theory-basics-for-songwriters/', label: 'Learn the theory behind lo-fi harmony →' },
    learnSectionTitle: 'Learn lo-fi music theory',
    relatedArticles: [
      { href: '/learn/music-theory-basics-for-songwriters/', label: 'Music theory basics for songwriters', description: 'Scales, modes, and the extended harmony behind mellow lo-fi sounds' },
      { href: '/learn/chord-progressions-for-beginners/', label: 'Chord progressions for beginners', description: 'Start with the fundamentals before exploring lo-fi seventh chord extensions' },
    ],
    progressions: [
      { title: 'Lo-fi Jazz Loop', chords: 'Cmaj7 Am7 Fmaj7 G7', bpm: 75, style: 'pop_basic', description: 'Warm extended chords at a relaxed tempo. Perfect for study beats.' },
      { title: 'Chill Minor', chords: 'Am7 Dm7 G7 Cmaj7', bpm: 80, style: 'pop_basic', description: 'Smooth minor-to-major journey. Melancholic but calming.' },
      { title: 'Study Vibes', chords: 'Fmaj7 Em7 Am7 Dm7', bpm: 70, style: 'pop_basic', description: 'Four flowing major seventh chords. Great for focus and concentration.' },
      { title: 'Rainy Day', chords: 'Cmaj7 Bm7 Em7 Am7', bpm: 72, style: 'pop_basic', description: 'Descending motion with rich seventh harmony.' },
    ],
  },
  {
    slug: 'sad',
    name: 'Sad',
    description: 'Melancholic progressions that evoke depth, longing, and emotion.',
    metaDescription: 'Sad chord progressions for emotional music. Minor keys, descending lines, and melancholic harmony — play and export instantly.',
    editorialIntro: [
      'Minor key progressions sound sad because of psychoacoustics and cultural conditioning working together. The minor third interval — the distance between the root and the third of any minor chord — creates a subtle dissonance that the brain interprets as unstable or unresolved. Western music has reinforced this association for centuries, so the moment you land on Am instead of A major, the listener\'s emotional register drops.',
      'Descending bass lines amplify this effect dramatically. A progression like Am–G–F–E (i–VII–VI–V in A minor) works because the bass moves chromatically downward: A, G, F, E. That falling motion creates a sense of inevitability and weight — it sounds like something ending, like an exhale. Classical composers used it for laments. Modern producers use it for dark trap beats. The emotional response is the same.',
      'The most powerful sad progressions use the minor iv chord. In a major key, the IV chord is major — in C major, that\'s F major. Borrowing the minor iv (Fm) from the parallel minor key creates an unexpected emotional dip that feels like grief. You hear it in "Yesterday," "The Sound of Silence," and countless other songs at their most affecting moments. The progressions below cover the full range — from simple minor triads to descending chromatic lines. Play them slowly and notice which moments feel most emotionally loaded.',
    ],
    learnLink: { href: '/learn/what-is-a-chord-progression/', label: 'Learn why minor chords sound sad →' },
    learnSectionTitle: 'Learn what makes progressions emotional',
    relatedArticles: [
      { href: '/learn/what-is-a-chord-progression/', label: 'What is a chord progression?', description: 'Why minor chords create sadness and how to use harmonic tension effectively' },
      { href: '/learn/chord-progressions-for-beginners/', label: 'Chord progressions for beginners', description: 'Minor keys, the vi chord, and how to write emotionally resonant songs' },
    ],
    progressions: [
      { title: 'Minor I–VI–III–VII', chords: 'Am F C G', bpm: 70, style: 'pop_basic', description: 'Classic melancholic pop. Starts in minor, resolves to relative major.' },
      { title: 'i–iv–v', chords: 'Am Dm Em', bpm: 65, style: 'pop_basic', description: 'Pure minor three-chord sadness. Raw and exposed.' },
      { title: 'i–VI–iv–V', chords: 'Am F Dm E', bpm: 75, style: 'pop_basic', description: 'Deep emotional pull with the iv chord adding extra weight.' },
      { title: 'Descending Minor', chords: 'Am G F E', bpm: 72, style: 'pop_basic', description: 'Falling bass line creates mounting tension and sadness.' },
      { title: 'i–VII–VI–v', chords: 'Am G F Em', bpm: 68, style: 'pop_basic', description: 'Slow descending line. Works well at half tempo for ballads.' },
    ],
  },
  {
    slug: 'happy',
    name: 'Happy',
    description: 'Uplifting, bright, and energetic chord progressions full of joy.',
    metaDescription: 'Happy chord progressions to play free — I–IV–V–I, I–iii–IV–V, and more upbeat major-key patterns. Real audio playback, no signup required.',
    editorialIntro: [
      'Happy chord progressions share a common trait: they stay in major keys and they move with momentum. The major third interval — the distance that defines every major chord — is acoustically stable. When you stack a major third and a perfect fifth on a root note, you get a chord that sounds complete and resolved. That stability is what the brain registers as brightness and positivity.',
      'The I–IV–V–I is the oldest happy progression in Western music. It powers folk songs, hymns, rock and roll, and children\'s music alike because the sequence of tonic, subdominant, dominant, and back to tonic follows the most fundamental harmonic logic: leave home, build tension, come back. At a fast tempo with a driving rhythm, it becomes anthemic. At a slower tempo with gentle strumming, it becomes pastoral.',
      'The iii chord is the secret weapon of happy progressions. In C major, Em (iii) carries both brightness — it shares two notes with the I chord — and a touch of wistfulness that keeps the progression from feeling saccharine. I–iii–IV–V uses this tension beautifully: the iii softens the move to IV and gives the listener something slightly unexpected before the resolution. Try the progressions below at different tempos — the same chords feel completely different at 120 BPM versus 135 BPM.',
    ],
    learnLink: { href: '/learn/chord-progressions-for-beginners/', label: 'Learn why major keys sound bright →' },
    learnSectionTitle: 'Learn upbeat chord writing',
    relatedArticles: [
      { href: '/learn/chord-progressions-for-beginners/', label: 'Chord progressions for beginners', description: 'Major keys, the I–V–vi–IV, and why they create an instantly uplifting feel' },
      { href: '/learn/what-is-a-chord-progression/', label: 'What is a chord progression?', description: 'The building blocks of every happy, upbeat song' },
    ],
    progressions: [
      { title: 'I–IV–V–I', chords: 'C F G C', bpm: 130, style: 'pop_basic', description: 'Classic uplifting major progression. Instantly recognizable.' },
      { title: 'I–ii–IV–I', chords: 'C Dm F C', bpm: 125, style: 'pop_basic', description: 'Bright and bouncy with a soft ii chord in the middle.' },
      { title: 'I–V–IV–V', chords: 'G D C D', bpm: 135, style: 'pop_basic', description: 'High energy shuffle feel. Great for anthems and feel-good pop.' },
      { title: 'I–iii–IV–V', chords: 'C Em F G', bpm: 120, style: 'pop_basic', description: 'The iii chord adds warmth before the IV resolution.' },
    ],
  },
  {
    slug: 'neo-soul',
    name: 'Neo Soul',
    pageTitle: 'Neo Soul Guitar Chord Progressions',
    description: 'Neo soul chord progressions lean on richer chords — maj9, min9, min11, and 13ths — for a warm, jazzy R&B color.',
    metaDescription: '6 neo soul chord progressions with maj9, min9, min11, and 13th chords. Play them instantly, free, no signup.',
    editorialQA: [
      {
        question: 'What makes neo soul chords sound different?',
        answer: '<strong>They use more notes.</strong> A regular chord like C major has 3 notes. Neo soul chords like Cmaj9 add 1–2 more on top, which makes them sound richer and smoother.',
      },
      {
        question: 'What are the "aug7" chords like Eaug7 doing here?',
        answer: 'They\'re <em>passing chords</em> — a quick, colorful step between two other chords, not somewhere the music stays. Think of it as a musical stepping stone.',
      },
      {
        question: 'What\'s the borrowed minor chord in Gospel Turn?',
        answer: 'Fmin7 is borrowed from the minor version of the key, just for one chord, before returning home to Cmaj7. It\'s a classic soul and gospel sound.',
      },
    ],
    learnLink: { href: '/learn/jazz-chord-progressions/', label: 'Neo soul borrows heavily from jazz — start here →' },
    learnSectionTitle: 'Learn neo soul harmony',
    relatedArticles: [
      { href: '/learn/jazz-chord-progressions/', label: 'Jazz chord progressions', description: 'Neo soul borrows extended jazz harmony — ii–V–I, ninths, and thirteenths explained' },
      { href: '/learn/music-theory-basics-for-songwriters/', label: 'Music theory basics for songwriters', description: 'Extended chords, sus chords, and the modal harmony behind neo soul' },
    ],
    progressions: [
      { title: 'Chromatic Passing', chords: 'Fmaj7 Eaug7 Amin7 Gmin7:2 Faug7:2', bpm: 78, style: 'soul_rnb', description: 'Eaug7 and Faug7 <em>slide</em> between the diatonic chords for a jazzy, unresolved color.' },
      { title: 'Parallel Ninths', chords: 'Emaj9 Dmaj9 Dmin9 Cmin11', bpm: 82, style: 'soul_rnb', description: 'Emaj9 slides down to Dmaj9, then <strong>flips quality</strong> into Dmin9 — a favorite neo soul move.' },
      { title: 'Minor Turnaround', chords: 'Amin7 Fmaj7 G13 E7', bpm: 85, style: 'soul_rnb', description: 'A minor-key turnaround — G13 and E7 both <em>pull hard</em> back toward Amin7.' },
      { title: 'Suspended Return', chords: 'Amin9 Dmin9 Emaj9 Dmin9', bpm: 80, style: 'soul_rnb', description: 'Dmin9 anchors the loop on both sides, with <strong>Emaj9</strong> as the lone major lift in the middle.' },
      { title: 'Open Groove', chords: 'Bbmaj9 Amin9 Dmin9 G13', bpm: 90, style: 'soul_rnb', description: 'Built for <strong>open voicings and space</strong> — let the groove do the work.' },
      { title: 'Gospel Turn', chords: 'Fmaj7 Fmin7 Cmaj7:8', bpm: 76, style: 'soul_rnb', description: 'The <em>iv</em> chord is borrowed from C minor — one detour that makes this the most soulful cadence around.' },
    ],
    faq: [
      { question: 'What key are these progressions in?', answer: 'Mostly <strong>F major and A minor</strong>, with one in Bb major. Use the editor\'s transpose button to shift any of them to your own key.' },
      { question: 'What tempo (BPM) should I play these at?', answer: '<strong>76–90 BPM</strong> — a relaxed, mid-tempo groove. Start slower if you\'re still learning the chord shapes.' },
      { question: 'Can I play these on guitar?', answer: 'Yes. The richer chords (maj9, min9, 13) usually <em>drop one note</em> to fit under four fingers — most guitar chord charts already do this for you.' },
      { question: 'Which progression should I try first?', answer: '<strong>Gospel Turn</strong> (Fmaj7 – Fmin7 – Cmaj7). Just three simple 7th chords, no 9ths or 11ths — the easiest starting point.' },
    ],
  },
  {
    slug: 'worship',
    name: 'Worship',
    description: 'Soaring, spacious chord progressions used in contemporary worship music.',
    metaDescription: 'Contemporary worship chord progressions in G major and C major. Play and export instantly with Chord Sequence.',
    editorialQA: [
      {
        question: 'Why do so many worship songs use the same chords?',
        answer: 'Worship music leans on a small set of progressions — built around the <strong>I, IV, V, and vi</strong> chords — because they\'re easy for a room full of people to sing along to. The same four chords, played softly in a verse and with full band in the chorus, can carry an entire song.',
      },
      {
        question: 'What key should I play worship songs in?',
        answer: '<strong>G major</strong> is the most common. It sits comfortably in the average singing range, and the open G chord rings out naturally on acoustic guitar and piano. C major and D major are close behind — use the editor\'s transpose button if a song sits too high or low for your voice.',
      },
      {
        question: 'Why does the vi chord (like Em in G) show up so often?',
        answer: 'It\'s a moment of <em>emotional shadow</em>. Em is the vi chord in G major — a minor chord built from the same key, but with a more vulnerable color. Placed between two major chords, it creates a brief dip before the progression lifts back up, mirroring the arc worship songs are built to create.',
      },
      {
        question: 'How do I make four chords feel different in a verse vs. a chorus?',
        answer: 'Change the <strong>arrangement, not the chords</strong>. Strip the verse down to one instrument playing softly, then bring in the full band on the chorus. The chord progression is the skeleton — the dynamics are the body. That contrast is where the power comes from.',
      },
      {
        question: 'Do these progressions actually match real worship songs?',
        answer: 'Yes — each one below is the exact chord sequence from a well-known song. See the description under each player for the match, or jump straight to <a href="/songs/10000-reasons-matt-redman/" class="underline underline-offset-2 hover:text-foreground transition-colors">10,000 Reasons</a>, <a href="/songs/goodness-of-god-bethel-music/" class="underline underline-offset-2 hover:text-foreground transition-colors">Goodness of God</a>, <a href="/songs/build-my-life-pat-barrett/" class="underline underline-offset-2 hover:text-foreground transition-colors">Build My Life</a>, or <a href="/songs/what-a-beautiful-name-hillsong-worship/" class="underline underline-offset-2 hover:text-foreground transition-colors">What A Beautiful Name</a> to play the full chord charts.',
      },
    ],
    learnLink: { href: '/learn/chord-progressions-for-beginners/', label: 'Learn the foundations of worship song structure →' },
    learnSectionTitle: 'Learn worship song structure',
    relatedArticles: [
      { href: '/learn/chord-progressions-for-beginners/', label: 'Chord progressions for beginners', description: 'The foundational I–V–vi–IV and I–IV–V used across modern worship music' },
      { href: '/learn/what-is-a-chord-progression/', label: 'What is a chord progression?', description: 'Understanding how chord movement creates emotional impact and space' },
    ],
    progressions: [
      { title: 'Worship I–V–vi–IV', chords: 'G D Em C', bpm: 72, style: 'pop_basic', description: 'The most common worship key progression. Soaring and open — the exact chords behind <a href="/songs/10000-reasons-matt-redman/" class="underline underline-offset-2 hover:text-foreground transition-colors">10,000 Reasons (Bless the Lord)</a> by Matt Redman.' },
      { title: 'Anthem Build', chords: 'C G Am F', bpm: 68, style: 'pop_basic', description: 'Wide, spacious anthem feel. Works at any tempo — you\'ll recognize it from <a href="/songs/goodness-of-god-bethel-music/" class="underline underline-offset-2 hover:text-foreground transition-colors">Goodness of God</a> by Bethel Music.' },
      { title: 'Slow Worship', chords: 'G Em C D', bpm: 60, style: 'pop_basic', description: 'Intimate and reverent. Perfect for ballad verses — the same shape used in <a href="/songs/build-my-life-pat-barrett/" class="underline underline-offset-2 hover:text-foreground transition-colors">Build My Life</a> by Pat Barrett.' },
      { title: 'Triumphant', chords: 'D A Bm G', bpm: 78, style: 'pop_basic', description: 'Brighter D major with uplifting resolution — the verse and chorus progression from <a href="/songs/what-a-beautiful-name-hillsong-worship/" class="underline underline-offset-2 hover:text-foreground transition-colors">What A Beautiful Name</a> by Hillsong Worship.' },
    ],
  },
  {
    slug: 'edm',
    name: 'EDM',
    description: 'High-energy chord progressions built for electronic dance music.',
    metaDescription: 'EDM chord progressions for house, trance, and electronic music. Play at 128–140 BPM and export your progression instantly.',
    editorialIntro: [
      'EDM progressions work differently from any other genre because the music is designed for physical response rather than narrative arc. Most EDM tracks loop a four-chord progression for minutes at a time — the harmonic content is almost irrelevant compared to the rhythmic tension of the drop, the filter sweep, and the build. But the chord choices still matter. A minor progression (Am–F–C–G) creates a darker, more driving energy than a major one, and the right progression can make a drop hit harder by setting up a specific harmonic expectation that the beat then fulfills.',
      'The minor i–VII–VI–V descending pattern is the most reliable EDM harmonic formula. In A minor: Am–G–F–E. The descending bass line creates momentum, and the V chord (E major, borrowed from the harmonic minor scale) creates maximum tension before the loop resets. Trance, progressive house, and big room EDM all rely on variations of this pattern. The V major chord is the secret — it sharpens the leading tone (G# instead of G) and makes the resolution back to Am feel inevitable.',
      'The other essential EDM technique is the drone or pedal point: keeping the bass on a single note while the chords above it change. C–G–Am–F over a sustained C bass creates a completely different harmonic texture than the same progression with a moving bass. The sustained bass creates ambiguity and tension that makes the drop feel like a release. Try the progressions below at their original tempos, then experiment with the editor to push them to 128–140 BPM and hear how the energy transforms.',
    ],
    learnLink: { href: '/learn/music-theory-basics-for-songwriters/', label: 'Learn how EDM uses basic theory for maximum energy →' },
    learnSectionTitle: 'Learn EDM music theory',
    relatedArticles: [
      { href: '/learn/music-theory-basics-for-songwriters/', label: 'Music theory basics for songwriters', description: 'How EDM producers use simple progressions and loops for maximum dancefloor impact' },
      { href: '/learn/what-is-a-chord-progression/', label: 'What is a chord progression?', description: 'How repeating simple loops became the backbone of electronic music' },
    ],
    progressions: [
      { title: 'Club Classic', chords: 'Am F C G', bpm: 128, style: 'pop_basic', description: 'The universal EDM minor progression. Works in every subgenre.' },
      { title: 'Trance Loop', chords: 'Am G F E', bpm: 140, style: 'pop_basic', description: 'Descending bass line with mounting intensity.' },
      { title: 'Progressive House', chords: 'C G Am F', bpm: 130, style: 'pop_basic', description: 'Classic build-and-drop structure for progressive tracks.' },
      { title: 'Euphoric Rave', chords: 'F C G Am', bpm: 138, style: 'pop_basic', description: 'Starts on IV for an instant emotional lift.' },
    ],
  },
  {
    slug: 'rock',
    name: 'Rock',
    description: 'Classic and modern rock chord progressions — from three-chord anthems to powerful minor riffs.',
    metaDescription: 'Rock chord progressions: I–IV–V, power chord riffs, and minor key anthems. Play and export instantly with Chord Sequence.',
    editorialIntro: [
      'Rock music is built on three chords and the truth — or so the saying goes. The I–IV–V in E major (E–A–B) powered the entire first decade of rock and roll, and it still works because the dominant seventh pull from B7 back to E is one of the strongest resolutions in Western harmony. Add a shuffle rhythm at 120 BPM and you have the skeleton of every Chuck Berry, Little Richard, and early Rolling Stones track ever recorded.',
      'Minor key progressions gave rock its darker edge. The i–VII–VI–VII pattern in A minor (Am–G–F–G) is the foundation of classic rock anthems from Stairway to Heaven to Smoke on the Water. The natural minor scale (using the lowered VII chord instead of the dominant) gives minor rock its characteristic raw quality — it sounds powerful without the resolution of a classical harmonic minor progression. Power chords — just the root and the fifth, no third — exploit this ambiguity perfectly: they\'re neither major nor minor, so they carry weight without sentimentality.',
      'The I–V–IV–V pattern deserves special mention. Unlike the standard I–IV–V, starting with the dominant creates immediate forward momentum. G–D–C–D in G major has been the backbone of driving rock anthems for decades. The trick is the tempo: at 100 BPM it feels like classic rock, at 140 BPM it becomes punk. The progressions below cover the essential rock vocabulary — play each at different tempos in the editor to find the feel that works for your track.',
      'Power chords — just the root and the fifth, no third — carry the weight of a chord without committing to major or minor tonality. That harmonic neutrality is what makes distorted guitar and power chord riffs work naturally together: the overtones from overdrive and distortion create less conflict without a third in the chord. When you play the I–IV–V with power chords on an overdriven amp, the result is pure kinetic energy with none of the harmonic sentimentality of triads.',
    ],
    learnLink: { href: '/learn/chord-progressions-for-beginners/', label: 'Learn the fundamentals behind rock chord writing →' },
    learnSectionTitle: 'Learn rock harmony',
    relatedArticles: [
      { href: '/learn/chord-progressions-for-beginners/', label: 'Chord progressions for beginners', description: 'The I–IV–V and its variations — the foundation of every rock song' },
      { href: '/learn/what-is-a-chord-progression/', label: 'What is a chord progression?', description: 'How power chords and triads create the harmonic backbone of rock' },
    ],
    progressions: [
      { title: 'I–IV–V (Classic Rock)', chords: 'E A B', bpm: 120, style: 'pop_basic', description: 'The three-chord foundation of rock and roll. Chuck Berry, Johnny B. Goode, and a thousand others.' },
      { title: 'I–V–IV–V (Driving Anthem)', chords: 'G D C D', bpm: 130, style: 'pop_basic', description: 'Starting on the dominant creates immediate forward momentum. Works at any rock tempo.' },
      { title: 'i–VII–VI–VII (Minor Rock)', chords: 'Am G F G', bpm: 120, style: 'pop_basic', description: 'Natural minor with a raised VII creates the classic rock anthem feel.' },
      { title: 'i–IV–i–V (Power Ballad)', chords: 'Am Dm Am E', bpm: 75, style: 'pop_basic', description: 'Slow minor progression with strong V resolution. Perfect for power ballads.' },
      { title: 'I–IV–ii–V (Blues-Rock)', chords: 'E A B7 B7', bpm: 110, style: 'pop_basic', description: 'Blues-influenced movement with a dominant seventh tension on V.' },
      { title: 'i–VI–III–VII (Arena Rock)', chords: 'Am F C G', bpm: 125, style: 'pop_basic', description: 'The relative major escape — dark but anthemic. Heard in decades of arena rock.' },
    ],
  },
  {
    slug: 'blues',
    name: 'Blues',
    description: 'Classic 12-bar blues and blues-influenced progressions — the harmonic foundation of rock, jazz, and R&B.',
    metaDescription: 'Blues chord progressions: 12-bar blues, minor blues, slow blues, and turnarounds. Play and export instantly with Chord Sequence.',
    editorialIntro: [
      'The 12-bar blues is the most important chord progression in American music. It is the shared language that rock, jazz, R&B, soul, and country all learned before developing their own dialects. The structure is simple: 12 bars divided into three four-bar phrases, using the I, IV, and V chords. In E major that means E7, A7, and B7. In C major: C7, F7, G7. The dominant seventh chord on every degree — including the I chord, which is normally major — is what gives the blues its characteristic sound. That I7 chord creates constant tension that never fully resolves.',
      'What makes the blues harmonically sophisticated is the "quick change" and the turnaround. The quick change jumps to the IV chord in bar 2 instead of staying on the I chord for four bars — this gives the progression more forward momentum. The turnaround is the last two bars: instead of ending on the I chord, the progression moves I–V (or I–V7) to set up the repeat. A great blues turnaround is a complete statement of tension and release in two bars.',
      'The minor blues replaces the major seventh chords with a natural minor framework. Where the major blues uses I7–IV7–V7, the minor blues uses im–IVm–Vm (or im–iv–v with the lowered VII). The emotional register drops dramatically — minor blues has the ache without the swagger. B.B. King\'s "The Thrill is Gone" and Clapton\'s "Still Got the Blues" use this vocabulary. The progressions below cover major blues, minor blues, slow blues, and turnaround variations. Play the 12-bar at 120 BPM and then at 70 BPM to hear how dramatically the feel transforms at different tempos.',
    ],
    learnLink: { href: '/learn/music-theory-basics-for-songwriters/', label: 'Learn the music theory behind blues harmony →' },
    learnSectionTitle: 'Learn blues harmony',
    relatedArticles: [
      { href: '/learn/jazz-chord-progressions/', label: 'Jazz chord progressions', description: 'Jazz borrowed the 12-bar blues and transformed it — start here to see how' },
      { href: '/learn/music-theory-basics-for-songwriters/', label: 'Music theory basics for songwriters', description: 'Dominant seventh chords, pentatonic scales, and the theory behind the blues' },
    ],
    progressions: [
      { title: '12-Bar Blues (E major)', chords: 'E7 E7 E7 E7 A7 A7 E7 E7 B7 A7 E7 B7', bpm: 120, style: 'pop_basic', description: 'The classic 12-bar blues in E. The most recorded chord progression in American music.', scale: { root: 4, scaleName: 'Blues Minor Scale', label: 'E Blues Scale' } },
      { title: '12-Bar Blues with Quick Change', chords: 'E7 A7 E7 E7 A7 A7 E7 E7 B7 A7 E7 B7', bpm: 120, style: 'pop_basic', description: 'Jumps to IV in bar 2 for extra momentum. Standard in Chicago blues.', scale: { root: 4, scaleName: 'Blues Minor Scale', label: 'E Blues Scale' } },
      { title: 'Slow Blues (C major)', chords: 'C7 F7 C7 G7 F7 C7', bpm: 60, style: 'pop_basic', description: 'Half-time feel at a slow tempo. Every note counts — leave space between the chords.', scale: { root: 0, scaleName: 'Blues Minor Scale', label: 'C Blues Scale' } },
      { title: 'Minor Blues', chords: 'Am7 Dm7 Am7 Em7 Dm7 Am7', bpm: 90, style: 'pop_basic', description: 'The ache of the blues in a minor key. B.B. King, Clapton, and Robben Ford all live here.', scale: { root: 9, scaleName: 'Blues Minor Scale', label: 'A Blues Scale' } },
      { title: 'Blues Turnaround (I–VI–II–V)', chords: 'E7 C#7 F#7 B7', bpm: 100, style: 'pop_basic', description: 'Classic turnaround used at the end of every blues chorus to set up the repeat.', scale: { root: 4, scaleName: 'Blues Minor Scale', label: 'E Blues Scale' } },
      { title: 'Gospel Blues', chords: 'G7 C7 G7 D7 C7 G7', bpm: 80, style: 'pop_basic', description: 'Slower, more resolved feel. The bridge between blues and gospel harmony.', scale: { root: 7, scaleName: 'Blues Minor Scale', label: 'G Blues Scale' } },
    ],
  },
  {
    slug: '12-bar-blues',
    name: '12-Bar Blues',
    description: 'The foundational 12-bar blues progression in every key — the harmonic backbone of rock, jazz, R&B, and soul.',
    metaDescription: '12-bar blues chord progressions in multiple keys. Play the classic I–IV–V blues pattern with dominant seventh chords instantly in your browser.',
    editorialIntro: [
      'The 12-bar blues is twelve bars divided into three four-bar phrases. The structure is always the same: four bars on the I chord, two bars on the IV chord, two bars back on the I chord, one bar on the V chord, one bar on the IV chord, and two bars to close on the I chord (often with a turnaround back to V). Written out in E major: bars 1–4 are E7, bars 5–6 are A7, bars 7–8 are E7, bar 9 is B7, bar 10 is A7, bars 11–12 are E7 (with B7 as the turnaround).',
      'The key detail is that every chord is a dominant seventh — including the I chord. In standard major key harmony, the I chord is major seventh (Imaj7). In the blues, it\'s I7. This flattened seventh on the tonic creates constant harmonic tension that never fully resolves, which is the emotional core of the blues sound. The music is always leaning forward, always aching. Combined with the pentatonic scale and bent notes, this harmonic ambiguity is what makes blues feel simultaneously mournful and driving.',
      'The "quick change" variation jumps to the IV chord in bar 2 rather than staying on the I chord for the first four bars. This adds forward momentum and is the standard form in Chicago blues and rock and roll. Robert Johnson played without the quick change; Chuck Berry almost always used it. Both are right — the choice changes the feel entirely. Use the interactive players below to hear both versions, try different keys in the editor, and notice how transposing from E to G major shifts the emotional register even though the harmonic structure is identical.',
    ],
    learnLink: { href: '/learn/jazz-chord-progressions/', label: 'See how jazz transformed the 12-bar blues →' },
    learnSectionTitle: 'Learn blues harmony',
    relatedArticles: [
      { href: '/learn/jazz-chord-progressions/', label: 'Jazz chord progressions', description: 'Charlie Parker and Coltrane used the 12-bar as the basis for jazz blues — see how' },
      { href: '/learn/music-theory-basics-for-songwriters/', label: 'Music theory basics for songwriters', description: 'Dominant seventh chords and the theory behind why the blues sounds the way it does' },
    ],
    progressions: [
      { title: '12-Bar Blues in E (Standard)', chords: 'E7 E7 E7 E7 A7 A7 E7 E7 B7 A7 E7 B7', bpm: 120, style: 'pop_basic', description: 'The definitive blues key. This exact progression appears in thousands of blues, rock, and R&B recordings.' },
      { title: '12-Bar Blues in A (Quick Change)', chords: 'A7 D7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7', bpm: 115, style: 'pop_basic', description: 'Quick change to IV in bar 2. Standard Chicago blues form used by Muddy Waters and Buddy Guy.' },
      { title: '12-Bar Blues in G', chords: 'G7 G7 G7 G7 C7 C7 G7 G7 D7 C7 G7 D7', bpm: 110, style: 'pop_basic', description: 'Comfortable guitar key. This is the form behind Crossroads and dozens of classic rock tracks.' },
      { title: '12-Bar Blues in C (Slow)', chords: 'C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7', bpm: 65, style: 'pop_basic', description: 'At 65 BPM the blues becomes a slow burner. Every chord transition carries maximum emotional weight.' },
      { title: 'Jazz Blues (Bebop)', chords: 'C7 F7 C7 C7 F7 F7 C7 Am7 Dm7 G7 C7 G7', bpm: 130, style: 'pop_basic', description: 'Charlie Parker style — substitutes Am7–Dm7–G7 in bars 8–10 for a ii–V–I turnaround feel.' },
      { title: 'Minor 12-Bar Blues', chords: 'Am7 Am7 Am7 Am7 Dm7 Dm7 Am7 Am7 Em7 Dm7 Am7 Em7', bpm: 90, style: 'pop_basic', description: 'The same 12-bar structure in a minor key. Darker and more introspective — the B.B. King sound.' },
    ],
  },
  {
    slug: 'ii-v-i',
    name: 'ii–V–I',
    description: 'The ii–V–I progression — the cornerstone of jazz harmony. In all keys, with extensions, and in minor.',
    metaDescription: 'ii–V–I chord progressions in all keys: major, minor, with extensions and substitutions. The foundational jazz progression explained with interactive examples.',
    editorialIntro: [
      'The ii–V–I is the most important three-chord movement in jazz. In C major: Dm7–G7–Cmaj7. The ii minor seventh chord (Dm7) creates mild tension, the V dominant seventh chord (G7) creates strong tension with its tritone interval (B to F), and the I major seventh chord (Cmaj7) resolves that tension completely. This arc of mild tension — strong tension — resolution appears in virtually every jazz standard ever written, from "Autumn Leaves" to "All The Things You Are" to "There Will Never Be Another You."',
      'What makes the ii–V–I powerful is the tritone in the dominant chord. In G7, the notes B and F form a tritone — an interval of six semitones that creates maximum harmonic tension because it is exactly halfway around the chromatic scale. That tritone wants to resolve: B moves up a half step to C, and F moves down a half step to E. Those two notes are the third and fifth of Cmaj7. The resolution is built into the physics of the progression — G7 is literally pointing at Cmaj7.',
      'The minor ii–V–i (also written ii°–V–i or ii∅–V–i) uses a half-diminished ii chord instead of a minor seventh. In A minor: Bm7b5–E7–Am7. The V chord in minor is E7 — a major dominant seventh, borrowing the G# from the harmonic minor scale. That raised leading tone makes the resolution to Am even stronger. Tritone substitution replaces G7 with Db7 — they share the same tritone (B/Cb and F) and create a chromatic bass descent (G–Db–C) into the tonic. The progressions below cover the ii–V–I in major and minor keys, with extensions, and with the most common jazz substitutions — each one playable and transposable directly in your browser.',
    ],
    learnLink: { href: '/learn/jazz-chord-progressions/', label: 'Read the complete guide to jazz chord progressions →' },
    learnSectionTitle: 'Learn ii–V–I theory',
    relatedArticles: [
      { href: '/learn/jazz-chord-progressions/', label: 'Jazz chord progressions', description: 'ii–V–I in context — how it builds entire jazz standards and connects to other progressions' },
      { href: '/learn/circle-of-fifths-explained/', label: 'Circle of fifths explained', description: 'Why ii–V–I follows the circle of fifths and how that generates harmonic momentum' },
    ],
    progressions: [
      { title: 'ii–V–I in C major', chords: 'Dm7 G7 Cmaj7', bpm: 120, style: 'pop_basic', description: 'The fundamental jazz movement. Dm7 (mild tension) → G7 (strong tension) → Cmaj7 (resolution).' },
      { title: 'ii–V–I with Extensions', chords: 'Dm9 G13 Cmaj9', bpm: 115, style: 'pop_basic', description: 'Same movement with ninth and thirteenth extensions. Adds color without changing the harmonic function.' },
      { title: 'Minor ii–V–i (A minor)', chords: 'Bm7b5 E7 Am7', bpm: 120, style: 'pop_basic', description: 'The minor key version. Bm7b5 (half-diminished) and E7 with G# create a stronger pull to Am.' },
      { title: 'ii–V–I in G major', chords: 'Am7 D7 Gmaj7', bpm: 130, style: 'pop_basic', description: 'Transposed to G. The same tension-resolution arc in a brighter key — standard in bebop heads.' },
      { title: 'Tritone Substitution', chords: 'Dm7 Db7 Cmaj7', bpm: 120, style: 'pop_basic', description: 'Db7 replaces G7 — they share the same tritone. Creates a chromatic descending bass line D–Db–C.' },
      { title: 'Extended ii–V–I Chain', chords: 'Dm7 G7 Cmaj7 A7 Dm7 G7 Cmaj7', bpm: 130, style: 'pop_basic', description: 'Two ii–V–I cycles linked by the VI7 (A7) turnaround. The backbone of many standard song forms.' },
    ],
  },
];

export function getGenre(slug: string): Genre | undefined {
  return GENRES.find((g) => g.slug === slug);
}
