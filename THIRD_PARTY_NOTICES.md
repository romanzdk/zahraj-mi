# Third-party notices

Zahraj mi is licensed under the [GNU Affero General Public License v3.0](LICENSE).
It builds on the following work.
The sound samples in `public/samples/` are not covered by the AGPL; they keep the license given below.

| Component | Use | License |
|---|---|---|
| [homr](https://github.com/liebharc/homr) by Christian Liebhardt | Optical music recognition models (ONNX), downloaded at build time | AGPL-3.0 |
| [homr-web](https://github.com/jymen/homr-web) | Browser port of homr | AGPL-3.0 |
| [RapidOCR](https://github.com/RapidAI/RapidOCR) / PaddleOCR models | Text models homr-web may load for tablature checks | Apache-2.0 |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | Runs the models | MIT |
| [OpenCV.js](https://github.com/TechStark/opencv-js) | Image processing inside homr-web | Apache-2.0 |
| [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) | Score rendering | BSD-3-Clause |
| [Tone.js](https://github.com/Tonejs/Tone.js) | Audio playback | MIT |
| [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm, via [Tone.js audio](https://github.com/Tonejs/audio) | Piano samples in `public/samples/piano` | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) by Nicholaus P. Brosowsky (2018); flute, violin and organ recorded for [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE) (CC0), guitar by the [University of Iowa Electronic Music Studios](https://theremin.music.uiowa.edu/MIS.html) (free to use without restrictions) | Flute, guitar, violin and organ samples in `public/samples/{flute,guitar,violin,organ}`, unmodified copies (except the cello notes below) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Cello notes from [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), recorded by [flcellogrl](https://freesound.org/people/flcellogrl/packs/12408/) on Freesound | Low violin notes `public/samples/violin/{E2,G2,C3,E3}.mp3`; modified: 4 dB quieter to match the violin | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [fflate](https://github.com/101arrowz/fflate) | Opening compressed MusicXML (`.mxl`) | MIT |
| [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) by Guido Zuidhof | Cross-origin isolation on static hosting (`public/coi-serviceworker.js`) | MIT |
| [Verovio](https://github.com/rism-digital/verovio), [resvg-js](https://github.com/thx/resvg-js), [Noto Serif](https://notofonts.github.io/) | Rendering the demo image (development only) | LGPL-3.0, MPL-2.0, OFL-1.1 |

The demo song is *Ode to Joy* (Ludwig van Beethoven, text by Friedrich Schiller), which is in the public domain.
