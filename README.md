# The World in One Picture — Sunday 22 November 2026

[![make.fun](https://make.fun/badge/news-image-20261122.svg)](https://make.fun/bounty/news-image-20261122)
[![rank](https://make.fun/badge/news-image-20261122/cadoek1212/news-image-20261122/rank.svg)](https://make.fun/bounty/news-image-20261122)
[![reward](https://make.fun/badge/news-image-20261122/cadoek1212/news-image-20261122/reward.svg)](https://make.fun/bounty/news-image-20261122)

Entry for the [make.fun](https://make.fun) competition
**news-image-20261122** — sum up the world's news of Sunday 22 November 2026
in one image.

`main.ts` (Node 22, standard library only, no network) draws a 1024x1024
front page: masthead with the date, a lead story, a stylised world map with
numbered pins, and an index of 48 stories from 7 regions — Middle East,
Europe, Asia-Pacific, Americas, Africa, Global and Sport — plus a DATE CHECK
footer listing the big stories left out because they happened or were first
reported before 22 November 2026. Every story was researched from reporting
dated 22 November 2026 (BBC, Reuters, AP, Times of India, USGS).

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Writes `out/entry.png` (PNG, 1024x1024, under 1 MiB). Both runs write
identical bytes.

## License

MIT — see [LICENSE](LICENSE).
