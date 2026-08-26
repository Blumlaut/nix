export default function Rules() {
  return (
    <main style={{ maxWidth: '760px' }}>
      <div className="page-head">
        <div>
          <h1>Rules</h1>
          <p>How to nix someone properly.</p>
        </div>
      </div>

      <section className="card">
        <h2>🎯 Goal of the game</h2>
        <p>
          The goal is to get another person, in a normal conversation, to answer your address with a fitting reaction —
          so that you can then say “Nix”. A remarkably efficient method for keeping grown-ups at work from doing their actual job.
        </p>
      </section>

      <section className="card">
        <h2>📜 Rules</h2>
        <ol className="rules-list">
          <li>
            <strong>The reaction has to come naturally.</strong> The person addressed must respond to a genuine address, for example with:
            <ul>
              <li>“Yeah?”</li>
              <li>“Yes?”</li>
              <li>“Huh?”</li>
              <li>“Ja?”</li>
              <li>“What?”</li>
              <li>“What’s up?”</li>
              <li>“Hm?”</li>
              <li>or a comparable reaction.</li>
            </ul>
          </li>
          <li><strong>“Nix” must come right after.</strong> As soon as the person reacts, the attacker answers with “Nix” immediately.</li>
          <li>
            <strong>No cheap yes-questions.</strong> Asking a question just because it will obviously be answered with “yes” doesn’t count.
            <div className="rules-example">Example: “Are you at work today?” → “Yes.” → “Nix.” ❌</div>
          </li>
          <li><strong>The address has to make sense.</strong> The attempt should at least give the impression that you actually want something from the person.</li>
          <li><strong>No forced reactions.</strong> Instructions like “Say yes” or “Answer with ‘What’s up?’” are invalid. We still have a shred of dignity, after all.</li>
          <li><strong>Ignoring is allowed.</strong> If the person addressed doesn’t react, there’s no “Nix” either.</li>
          <li><strong>A successful nix counts instantly.</strong> Debating whether you “knew it was coming” changes nothing. If you answered, you were nixed.</li>
          <li>
            <strong>Once you’ve reacted, you’re on your own.</strong> As soon as you yourself have answered an address with “Yes”, “Yeah”, “Ja”, “Huh?”, “What?” or a comparable reaction, you’re practically already out. Saying “Nix” yourself preemptively does not count as protection. If your opponent then answers with “Nix”, you were nixed successfully anyway.
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>🏆 The golden rule</h2>
        <p>A good nix is born of deception, timing, and a credible address — not of bluntly forcing someone to say a specific word.</p>
        <p>In short:</p>
        <p className="flow">Address → natural reaction → “Nix” → an unnecessarily enormous personal satisfaction.</p>
      </section>
    </main>
  );
}
