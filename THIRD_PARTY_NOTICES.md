# Third-party notices

Zahraj mi is licensed under the [GNU Affero General Public License v3.0](LICENSE).
It builds on the following work.

| Component | Use | License |
|---|---|---|
| [homr](https://github.com/liebharc/homr) by Christian Liebhardt | Optical music recognition models (ONNX), downloaded at build time | AGPL-3.0 |
| [homr-web](https://github.com/jymen/homr-web) | Browser port of homr | AGPL-3.0 |
| [RapidOCR](https://github.com/RapidAI/RapidOCR) / PaddleOCR models | Text models homr-web may load for tablature checks | Apache-2.0 |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | Runs the models | MIT |
| [OpenCV.js](https://github.com/TechStark/opencv-js) | Image processing inside homr-web | Apache-2.0 |
| [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) | Score rendering | BSD-3-Clause |
| [Tone.js](https://github.com/Tonejs/Tone.js) | Audio playback | MIT |
| [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm, via [Tone.js audio](https://github.com/Tonejs/audio) | Piano samples in `public/samples/piano` | CC BY 3.0 |
| [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) by Nicholaus P. Brosowsky (recorded by [VSCO 2 Community Edition](http://vis.versilstudios.net/vsco-community.html) and the [University of Iowa Electronic Music Studios](http://theremin.music.uiowa.edu/)) | Flute, guitar, violin and organ samples in `public/samples/{flute,guitar,violin,organ}` | CC BY 3.0 |
| [fflate](https://github.com/101arrowz/fflate) | Opening compressed MusicXML (`.mxl`) | MIT |
| [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) by Guido Zuidhof | Cross-origin isolation on static hosting (`public/coi-serviceworker.js`) | MIT |
| [Verovio](https://github.com/rism-digital/verovio), [resvg-js](https://github.com/thx/resvg-js), [Noto Serif](https://notofonts.github.io/) | Rendering the demo image (development only) | LGPL-3.0, MPL-2.0, OFL-1.1 |

The demo song is *Ode to Joy* (Ludwig van Beethoven, text by Friedrich Schiller), which is in the public domain.
