/**
 * Soft remediation pass for articles that failed validation on recoverable
 * style errors. Targets the LLM-stylometric-tic check specifically: the
 * full regen costs 5-7 minutes of compute (re-scrape sources + re-prompt +
 * re-Amazon match) whereas a targeted "rewrite to strip these N tics"
 * round-trip with Claude is ~30-60 seconds and preserves all the structure
 * (frontmatter, components, links, scores) that the model already got right.
 *
 * Hard errors (insufficient sources, missing image coverage, broken
 * frontmatter) are NOT remediable — they require either a new scrape or
 * structural rewrite — so they still bubble up as failures.
 *
 * Bounded: max 1 remediation attempt per article. If the rewrite produces
 * an article that still fails validation, we fall back to the standard
 * fail-and-retry path (errorCount++ in the queue/registry).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { validateGeneratedArticle, scanLlmTics } from './article-validator.js';

/** Return true when `errors` contains an LLM-tic error and NOTHING else
 *  (other errors are not addressable by the dash/phrase rewrite). */
export function isRemediableErrorSet(errors) {
  if (!errors?.length) return false;
  const onlyTicErrors = errors.every(e => /^LLM stylometric tics:/.test(e));
  return onlyTicErrors;
}

/**
 * Attempt one remediation pass on the .mdx at `outputPath`. On success the
 * file is overwritten with the rewritten version and the function returns
 * the new content. On failure the original file is untouched and the
 * function returns `null` so the caller can fall through to its normal
 * failure path.
 */
export function remediateLlmTics(outputPath) {
  const original = readFileSync(outputPath, 'utf-8');

  // Re-scan to surface the exact tics the rewrite must remove. The
  // validator's error string is summarised; we want the full hit map.
  // Strip frontmatter + components the same way the validator does so the
  // counts reported to Claude match what the next validation pass will see.
  const body = original
    .replace(/^---[\s\S]*?\n---\n/, '')
    .replace(/<[A-Z][\s\S]*?\/?>/g, '');
  const { count, hits } = scanLlmTics(body);
  if (count === 0) return original;  // already clean (shouldn't happen — caller checked)

  const isFr = /\nlanguage:\s*['"]?fr/.test(original) || /\nintent:\s*(comparatif|avis|guide|informational)/.test(original);

  const tmpDir = mkdtempSync(join(tmpdir(), 'remediate-'));
  const promptPath = join(tmpDir, 'prompt.txt');
  writeFileSync(promptPath, buildRemediationPrompt({ outputPath, hits, isFr }));

  console.log(`  🔁 LLM-tic remediation pass (${count} hits): invoking Claude…`);
  const result = spawnSync('claude', ['-p', '--dangerously-skip-permissions'], {
    input: readFileSync(promptPath, 'utf-8'),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
    maxBuffer: 32 * 1024 * 1024,
  });
  rmSync(tmpDir, { recursive: true, force: true });

  if (result.status !== 0) {
    console.warn(`  ⚠️  Remediation: Claude CLI exited ${result.status}`);
    return null;
  }

  const rewritten = readFileSync(outputPath, 'utf-8');
  if (rewritten === original) {
    console.warn('  ⚠️  Remediation: file unchanged after Claude pass');
    return null;
  }

  // Sanity-check: the rewrite should preserve frontmatter and structure.
  // We rely on validateGeneratedArticle to catch structural damage on the
  // re-validation pass — here we just confirm the file still has YAML.
  if (!rewritten.startsWith('---')) {
    console.warn('  ⚠️  Remediation: frontmatter clobbered — discarding rewrite');
    writeFileSync(outputPath, original);
    return null;
  }

  const stillBad = validateGeneratedArticle(rewritten);
  if (stillBad.length > 0) {
    console.warn(`  ⚠️  Remediation: validator still rejects: ${stillBad.join('; ')}`);
    return null;
  }
  console.log('  ✅ Remediation: tics cleared, article passes validation');
  return rewritten;
}

function buildRemediationPrompt({ outputPath, hits, isFr }) {
  const ticList = Object.entries(hits)
    .map(([tic, n]) => `  - ${tic} : ${n} occurrence(s)`)
    .join('\n');

  if (isFr) {
    return `Tu dois corriger un article qui contient des "tics LLM" interdits par la charte éditoriale.

CHEMIN DU FICHIER : ${outputPath}

TICS DÉTECTÉS DANS LE CORPS DE L'ARTICLE :
${ticList}

INSTRUCTIONS STRICTES :
1. Utilise l'outil Read pour ouvrir le fichier ci-dessus.
2. Repère CHAQUE occurrence des tics listés DANS LE CORPS uniquement (jamais dans le frontmatter YAML, ni dans les attributs des composants <ProductCard>, <ComparisonTable>, <AffiliateButton>, <SourceList>).
3. Réécris chaque occurrence en utilisant une ponctuation/formulation équivalente :
   - tiret cadratin (—) ou demi-cadratin (–)  →  virgule, point, deux-points, parenthèses, point-virgule (au choix selon le rythme). Le trait d'union "-" dans un mot composé reste autorisé.
   - phrase bannie  →  reformulation directe sans la phrase (ne pas l'imiter avec un synonyme).
4. Sauvegarde le fichier complet avec l'outil Write au MÊME chemin.

RÈGLES NON NÉGOCIABLES :
- Ne change PAS le frontmatter YAML.
- Ne change PAS les composants (\`<ProductCard ...>\`, \`<ComparisonTable ...>\`, \`<AffiliateButton ...>\`, \`<SourceList />\`, etc.).
- Ne change PAS les liens internes en markdown ([texte](url)).
- Ne change PAS les valeurs factuelles (prix, scores, noms de produits, ASINs).
- N'ajoute AUCUNE nouvelle information : seulement la réécriture stylistique.
- Conserve la longueur globale (±5%).

Quand tu as fini, écris une seule ligne de confirmation : "OK : X corrections appliquées".`;
  }
  return `You must fix an article that contains forbidden "LLM tics" per the editorial guidelines.

FILE PATH: ${outputPath}

TICS DETECTED IN THE BODY:
${ticList}

STRICT INSTRUCTIONS:
1. Use the Read tool to open the file above.
2. Find EVERY occurrence of the listed tics IN THE BODY only (never in the YAML frontmatter, never inside <ProductCard>, <ComparisonTable>, <AffiliateButton>, <SourceList> component attributes).
3. Rewrite each occurrence with equivalent punctuation/phrasing:
   - em dash (—) or en dash (–)  →  comma, period, colon, parentheses, or semicolon (your choice based on rhythm). The hyphen "-" inside compound words is allowed.
   - forbidden phrase  →  rewrite the sentence WITHOUT the phrase (do not swap a synonym).
4. Save the full file with the Write tool at the SAME path.

NON-NEGOTIABLE RULES:
- DO NOT modify the YAML frontmatter.
- DO NOT modify components (\`<ProductCard ...>\`, \`<ComparisonTable ...>\`, \`<AffiliateButton ...>\`, \`<SourceList />\`, etc.).
- DO NOT modify markdown internal links ([text](url)).
- DO NOT modify factual values (prices, scores, product names, ASINs).
- DO NOT add new content: stylistic rewrite only.
- Preserve overall length (±5%).

When done, write a single confirmation line: "OK: X corrections applied".`;
}
