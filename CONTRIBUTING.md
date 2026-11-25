# Contributing

Thanks for helping! Issues and pull requests are welcome, in English or Czech.

## Reporting a misread score

Recognition quality is the hardest part. A good report has:

- the image (only if you have the right to share it – public domain or your own music),
- what you expected and what was played (the downloaded MusicXML helps),
- browser and device.

Problems in the recognition itself usually belong upstream in [homr](https://github.com/liebharc/homr) or [homr-web](https://github.com/jymen/homr-web); we will forward them.

## Development

```bash
npm ci
npm run dev
```

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run models && npm run build && npm run test:e2e
```

Keep changes small and focused, add a unit test for logic changes, and describe in the PR what you checked.
By contributing you agree that your work is licensed under the AGPL-3.0.
