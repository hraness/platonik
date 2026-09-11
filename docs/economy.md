# A market for useful discoveries

Design proposal, 11 September 2026. Platonik's website is implemented; its game, accounts, credits, contracts, and market are not. This page proposes a multiplayer economy around a single-player laboratory. Example prices and outcomes are fictional.

## Your creature could save someone else's world

You have spent an evening helping Moss find a way around a broken road. On the expedition board, another player needs exactly that habit. Their colony is fast until the first collapse, then the beacon goes dark.

Their offer: **“Help this colony survive the damaged routes. Keep its good journeys good. Reward: 120 credits.”** Your agent compares the published requirements with Moss's abilities. You accept a commission, try a descendant in your own laboratory, and submit the best candidate. If independent trials confirm the promised improvement, you earn the reward. The other player gets a new possibility for their colony. Everyone gets a reusable program and an experiment to inspect.

The emotional reward is seeing a creature you cared for become useful elsewhere. The market adds a reason to specialize, an audience for your discoveries, and a new question when you finish an expedition: **who needs what this little thing can do?**

## What players would buy

Programs are information. Once a genome is public under a reuse license, someone can copy it without paying its discoverer. Spending compute also does not guarantee a useful or novel result. A market built around charging for copies would conflict with a public research library.

Start by buying **work toward a specified result**. A commission pays for an improvement, an adaptation, or a reproducible failure that the buyer wants someone to find. Public genomes remain free to inspect and reuse. Discovery attribution stays in their lineage; it creates neither exclusive ownership of a behavior nor automatic royalties on descendants.

| A player needs… | A researcher could deliver… | What earns payment |
| --- | --- | --- |
| A courier that recovers | A descendant that handles declared route collapses | Passing the contract's completion and cost thresholds |
| A smaller colony | The same required behavior with fewer cells | Meeting all retained requirements within the new body bound |
| A favorite in a new habitat | An adaptation to different local observations | Passing the target habitat's fixed assay |
| An explanation for a failure | A smaller, reproducible counterexample | A checked failure and the contract's explicit size criterion |

These are separate contract families. “Interesting,” “intelligent,” and “scientifically novel” are too vague for automatic settlement. A human research review may recognize significance later; the market pays against the frozen test it actually knows how to check.

## The first contract market

Begin with fixed rewards and a small set of organizer-reviewed contract templates. A buyer chooses a template, attaches a baseline, sets the reward, and funds escrow. The template fixes the allowed target parameters, checker, evaluation budget, and public reuse license. Neither party can upload an arbitrary settlement script.

Before work begins, the buyer and one researcher accept the same contract revision. It specifies the baseline hash, measurable improvement, preserved capabilities, case distribution, language and cost versions, deadline, attempt allowance, delivery and publication terms, and failure/refund rules. Acceptance atomically assigns the already-funded escrow and reserves evaluator capacity. Unassigned offers can expire or be cancelled; accepted terms cannot change unilaterally. An objectively satisfied contract cannot be rejected because the buyer changed their mind.

The researcher works locally at their own compute expense. A deadline limits how long a commission can be occupied, and a small active-contract allowance limits hoarding. Delivery time is measured by the service accepting a valid bounded submission, not by when its evaluation queue finishes. Timely deliveries keep escrow reserved while evaluation completes; a timeout cannot race a pending payout. An operational failure gets a bounded retry and then the published refund path, never a fabricated verdict.

The evaluator reruns the submission under equal execution bounds on withheld cases. Seed commitment, restricted feedback, and later evidence release follow the [competition protocol](competition.md#training-submission-and-replay). The contract declares whether a known public routine is acceptable or it requires a measured improvement over a frozen baseline. Organizer-funded discovery rewards require the latter and deduplicate awards within their declared scope. A new byte string alone earns nothing; detecting every equivalent algorithm is not an admission requirement.

A qualifying result releases escrow once the verified artifact and receipt are durably retrievable under the agreed delivery terms. The first pilot promises immediate public release: confirm the public delivery before paying, and reject submissions with incompatible unreleased competition commitments. A market listing may appear later; a private upload alone is not delivery. A future delayed-release contract must freeze access and publication timing at acceptance.

Exhausted attempts, no timely delivery, or a final failure produce the agreed refund. A service delivery failure follows its bounded recovery/refund path before payment. Partial payment requires explicit milestones fixed at acceptance. Replayed requests, duplicate callbacks, and two workers finishing the same evaluation cannot pay twice.

This is a reserved commission, not a race to copy another entrant's answer. An open bounty competition can come later with a closing time, committed entries, tie rules, and a fixed total payout. The organizer must reserve its worst-case verification cost before opening either form.

## Prices, bids, and the EVE influence

[EVE's buy and sell orders](https://support.eveonline.com/hc/en-us/articles/203218932-Buy-and-Sell-Orders) and [item exchange contracts](https://support.eveonline.com/hc/en-us/articles/206758389-Item-Exchange-Contract) offer useful precedents for stated terms and exchange. For Platonik, the interesting part is a society of specialists whose work becomes useful to one another.

Let buyers set rewards first. Later, a buyer could invite quotes and choose a researcher by proposed price, time, and a visible history of completed contracts. Accepting a quote freezes those terms and funds the same escrow flow. A cheap bid is not a promise of success; the contract determines payment.

Auctions belong later, when there is something actually scarce to allocate, such as a researcher's limited scheduled work. Public program copies do not need artificial scarcity. A worldwide live order book, speculative currency, and automated market makers add little to the first rescue commission.

New habitat releases can change demand: a creature overlooked last season may have the habit that a new expedition needs. Couriers, colony breeders, compact-policy specialists, and counterexample hunters can each find a role. Scientific credit should describe the contribution and evidence, independently of its sale price.

## Credits have a job

Credits are proposed in-game accounting units with no cash redemption. A player earns them from a limited organizer-funded expedition board or another player's funded commission, then uses them to commission help. Their practical value is access to other players' effort; whether that exchange is fun and liquid needs a playtest.

The organizer publishes a finite season issuance budget. Local saves, self-reported compute, repeated hashes, easy task replays, and creating another account cannot mint credits. Publicly funded rewards need globally limited contract slots and admission controls; per-account limits alone do not stop multiple-account farming. Start an economic pilot with a bounded participant cohort before opening those faucets widely.

Player-to-player settlement transfers existing credits. Modest published listing or modification fees can discourage spam and remove credits from circulation. Fees, issuance, and outstanding escrow must be visible in aggregate. Self-trades and volume do not award status, rebates, credits, or scientific reputation. Completed-contract counts are descriptive history, not proof of research merit or independent counterparties.

Credits cannot buy extra execution fuel, privileged sensors, hidden-test probes, or priority within a ranked admission allowance. Hiring a better researcher can improve a genome, just as using a stronger external agent can; the organism still faces the same [competition limits](competition.md). Keep balances, contract history, lineage credit, and organism rank as separate records. Contract assays use their own cases and do not expose the ranked round's hidden evaluation set.

Game credits do not pay a cloud invoice. Submission quotas and a separate real operating budget cap hosted verification, even when a player has a large balance. Ordinary local play remains available without a market account.

## What to prove before building more

First finish the [local beacon expedition](engine.md#first-playable-acceptance). Then run a small hosted trial: one contract family, fixed rewards, a few participants, independently checked deliveries, and an auditable ledger. Look for repeat commissions, useful public artifacts, and players choosing to specialize. A high trading volume by itself is not success.

Before broader access, demonstrate exact-once financial effects under retries, atomic escrow and refunds, duplicate and invalid submission rejection, safe deadline handling, and replayable evidence. Test whether someone can drain the evaluator budget or capture all open contracts. Calibrate fees and reward supply from this pilot, then consider quotes and pooled bounties.

The proposed [storage and cost design](storage.md) keeps most experimentation on players' machines, public reading inexpensive, and the authoritative hosted service small.
