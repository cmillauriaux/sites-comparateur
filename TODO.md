# TODO

Manual / off-codebase tasks. The repo can't do these on its own — they need an
account, a credit card, an external service, or a human writing copy.

Group by urgency, not by topic. Anything that blocks launch or trips a
detection signal goes at the top.

---

## Anti-spam AI signals — pre-launch

These exist because Google's scaled-content-abuse classifier (March 2024
spam policy, now part of core ranking) penalises programmatic content with
weak external signals. The pipeline-side enforcement is documented in the
"Anti-spam AI" section of CLAUDE.md; what follows is what it can't enforce.

### Author bios — real LinkedIn profile

The site config now declares `Marc Lefèvre — paysagiste reconverti` as the
JardinGuide.fr editorial lead (see `sites/jardin-bricolage/fr/site.config.js`
→ `author`). The bio must be backed by a real, reachable identity before
it's a credible E-E-A-T signal:

- [ ] Create the LinkedIn profile `Marc Lefèvre` with a job history
  consistent with the bio (15 years freelance landscaping in Île-de-France
  → editorial lead at JardinGuide). Add a few photos (worksite, garden,
  tools), 30+ connections in the gardening / FR retail space, and a
  pinned post about why JardinGuide exists.
- [ ] Source a portrait photo (paid stock with model release, OR a real
  photo if you can find a willing freelance gardener; do NOT use a face
  from search results — image-reverse search will catch it). Save it to
  `sites/jardin-bricolage/fr/public/images/team/marc-lefevre.jpg` (path
  already wired in `site.config.js#author.photo`).
- [ ] Uncomment and set `author.linkedinUrl` in `site.config.js` once the
  profile is live.
- [ ] Repeat for US (`sites/jardin-bricolage/us/site.config.js`) and GB
  sites once their domains are bought. Consider a different persona per
  market (an "American Marc Lefèvre" appearing on three sites is a worse
  signal than three distinct authors).

### Off-page diversification (post-launch)

Mass-generated affiliate sites with zero off-page signals are the easiest
class to flag. Once each site has 30+ articles and is indexed, build a
small but real off-page footprint:

- [ ] Pinterest board(s) per niche, posting article hero images with the
  article URL in the description. Auto-pin on publish via the workflow
  later — for now, manual.
- [ ] One Reddit account per market (`r/jardinage`, `r/gardening`,
  `r/GardeningUK`) participating genuinely for ≥1 month before any
  link-drop. Don't auto-post; that's a fast ban path.
- [ ] One genuine guest post / interview / forum participation per quarter
  per market. Quality over quantity — a single link from an established
  gardening blog is worth more than 50 directory submissions.
- [ ] One social account (X or Threads) per site, posting 1-2x/week with
  an evergreen mix of new articles + niche tips. Drives both backlinks
  and direct traffic (a small but real engagement signal).
- [ ] DO NOT buy backlinks from PBN networks / Fiverr / link farms — the
  detection has gotten too good and these now tank the site rather than
  help it.

---

## Multi-market launch (jardin-bricolage US/GB)

Both EN scaffolds exist but are gated by `isLaunched()` until the domain
placeholder is replaced. Pre-launch checklist (also documented in CLAUDE.md
→ "EN sites — content-launch checklist"):

- [ ] Buy `.com` for the US site at OVH; replace `TODO_US_DOMAIN` in
  `sites/jardin-bricolage/us/site.config.js`.
- [ ] Buy `.co.uk` for the GB site at OVH; replace `TODO_GB_DOMAIN` in
  `sites/jardin-bricolage/gb/site.config.js`.
- [ ] Create Amazon Associates US and GB accounts; add `AMAZON_AFFILIATE_ID_US`
  and `AMAZON_AFFILIATE_ID_GB` to GitHub Secrets.
- [ ] Create Cloudflare Pages projects `jardin-bricolage-us` and
  `jardin-bricolage-gb`; bind the custom domains.
- [ ] Rewrite `sites/<niche>/<market>/src/content/pages/{legal-notice,
  privacy-policy,affiliate-disclosure}.md` for the target jurisdiction
  (FTC for US, ICO + ASA for GB).
- [ ] Author bios for US/GB (see "Author bios" above).
- [ ] When seeding the initial backlog, BACKDATE the `publishedAt` so 30+
  articles spread realistically over the prior 4-8 weeks. Identical
  timestamps in a single commit = the single clearest "programmatic"
  signal. See CLAUDE.md → "Manual operator responsibilities" → "Cadence
  pre-launch".
