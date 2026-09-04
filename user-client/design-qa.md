# Design QA — 初始思考修订后的完整重放

- Source evidence: browser comment showing the former full-text deletion block plus detached replacement block, represented by `/private/tmp/user-client-inline-revised-viewport.png`
- Implementation screenshots: `/private/tmp/user-client-inline-diff-regeneration.png`, `/private/tmp/user-client-revised-flow-complete.png`
- Primary viewport: `1536 × 1354`

## Visual comparison

The source and updated implementation were inspected together in one visual comparison.

- P1 — Detached revision summary: fixed. The saved edit now stays inside the original paragraph; unchanged tokens remain normal, removed tokens use `#A0A8B5` with a line-through, and inserted tokens use `#2863C7` on `#EAF2FF` at their actual insertion positions.
- P1 — Downstream content did not visibly regenerate: fixed. The Plan changes from the original five steps to a new five-step path, all three capability nodes execute again with revised progress copy, and every later thought segment plus the final Markdown answer is replaced.
- P1 — Revision changed only the answer: fixed. The browser observed `内部知识检索 → Web Search → 数值计算` in the running state after saving the initial thought.
- P2 — Thought content was too sparse: fixed. The initial sequence now contains `632 / 253 / 482 / 496 / 457` characters (`2320` total); regenerated downstream thoughts contain `375 / 450 / 470 / 448` characters (`1743` total) and remain intentionally uneven.
- P2 — Nodes looked like a grouped tool list: fixed. The completed view retains chronological `thought → node → thought` alternation, with long and short reasoning blocks around each of the three flat nodes.

The final Markdown answer remains visually outside the gray thinking surface after a divider. Computed typography remains distinct: result body `13px / #344054`, thought text `12px / #667085`, and capability metadata uses its smaller tertiary treatment.

## Interaction verification

- Saving the initial thought preserves exactly one user message and one assistant response.
- The revised Plan titles are `重设决策优先级`, `补查授权与交割条件`, `验证可执行货源`, `重算协商阈值`, and `更新签约与退出条件`; editing is not a Plan step.
- The browser observed all three capability nodes enter the running state and later finish as `已完成`.
- The final answer changed from the original “建议先协商调整条款…” opening to “修订后的优先路径是…”, and finished with `aria-busy="false"` plus a visible report.
- Inline revision DOM contains deletion and insertion spans and no `.thought-inline-old` or `.thought-inline-new` blocks.
- No horizontal overflow was detected on the document, main pane, thread, or assistant-content container.
- Automated checks: `node --check src/fixture.js`, `node --check src/app.js`, `node tests/flow-check.mjs`, and `node tests/static-check.mjs` passed.

final result: passed
