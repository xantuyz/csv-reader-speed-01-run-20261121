[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/xantuyz/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/xantuyz/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed-01-run-20261121

A faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader), written
for the make.fun bounty "Read broken CSV files faster, 21 November 2026".

`solve.js` exports `run(input)`, returning exactly what csv-reader 1.0.0
returns for the same `{text, header}`: `{columns, rows, errors}` — same
broken-row policy, same error order, same line counting. It is faster
because the common record (a line with no quote and no stray CR) is read in
one native sweep (`indexOf` + `slice` + `split`), while records holding a
quote or a stray CR go through a slow path that still jumps with `indexOf`
and a small delimiter regex instead of walking characters.

`main.ts` is the harness driver (unchanged from the house baseline): it reads
`/input/cases.json`, answers each case with `run`, and writes
`/output/answers.json`.

## License

MIT — see `LICENSE`.
