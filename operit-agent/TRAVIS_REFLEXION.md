# Travis Reflexion

Standard-library failure memory integrated into `route()`, using the existing cognitive SQLite database. No framework installation, model download, paid fallback or model-weight update is required.

## Runtime

* Each dispatched tool result receives an external verdict: success, failure or unknown. Exceptions and structured tool failures are failures. Process exit codes verify process execution only. Model assertions, confidence and source links do not establish answer correctness.
* Failures create short, deduplicated lessons with timestamps, task type, context keywords, observed cause, proposed correction and the source observation. Corrections remain hypotheses until tested.
* Every task recalls up to three relevant lessons. Inference and repository-analysis prompts receive them; deterministic tools do not gain new permissions or automatically repeat side effects. The response reports recalled and actually used lesson counts.
* Service startup opens a session and retrieves three recent lessons. Each task retrieves its own relevant subset.
* `~/.centro-jarvis/capabilities-and-limits.json` records observed successes, failures and unknowns by tool, with the verification scope. This is neither an authorization list nor a permanent declaration of inability.
* The response includes `verification`. Conversation prose without an independent checker remains unknown. Unknown outcomes are not learned as successful strategies.

## Checks

```sh
python3 operit-agent/travis_reflexion_selftest.py
python3 operit-agent/travis_cognitive_selftest.py
python3 operit-agent/jarvis_selftest.py
```

## Isolated experiment

Start the existing local inference server, then run:

```sh
python3 operit-agent/travis_reflexion_eval.py --provider local --output /tmp/travis-reflexion-trial-1 --repetitions 3
```

The output directory must be new for the first run. If interrupted, repeat the same command with `--resume`: completed batches are retained, raw responses are audited, and a model change blocks comparison. A uses the model and task contracts without lessons; B adds externally checked failure lessons; C adds a self-awareness prompt without lesson storage. Thirty synthetic cases cover tools, dates and JSON formats. Two independent sessions use matched task families with different values. Conditions are shuffled within each repetition. After B, only that experiment's lesson table is erased and the second-session cases are repeated. Production lessons are never erased.

Outputs: raw model responses, per-case answers, model identity, confidence coverage, Brier score, second-session accuracy, recovery among first-session failures, repeated-failure rate, correct refusal rate and per-repetition results. A failed inference request interrupts the experiment; it is not counted as a wrong answer.

This is a component experiment, not a benchmark of the entire voice agent. Its repeated-error metric initially measures repeated failure on matched case families, not a proof of identical semantic causes. Batched responses and parsing failures can dominate small-model results. Results from a local reserve model do not establish improvement in the remote conversation model. A completed run alone proves no benefit: require consistent B superiority over A and C and a corresponding loss after ablation; otherwise report no demonstrated improvement.
