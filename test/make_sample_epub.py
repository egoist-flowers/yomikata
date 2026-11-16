import zipfile
import os

OUT = os.path.join(os.path.dirname(__file__), 'sample.epub')

container = '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
'''

opf = '''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="ja">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:yomikata-sample-0001</dc:identifier>
    <dc:title>吾輩は猫である（テスト版）</dc:title>
    <dc:creator>夏目 漱石</dc:creator>
    <dc:language>ja</dc:language>
    <dc:description>よみかたの動作確認用に作られた短いサンプルです。</dc:description>
    <meta property="dcterms:modified">2026-11-04T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="chapter3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
    <itemref idref="ch3"/>
  </spine>
</package>
'''

nav = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja">
<head><meta charset="UTF-8"/><title>目次</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目次</h1>
    <ol>
      <li><a href="chapter1.xhtml">第一話　吾輩は猫である</a></li>
      <li><a href="chapter2.xhtml">第二話　名前はまだ無い</a></li>
      <li><a href="chapter3.xhtml">第三話　どこで生れたか</a></li>
    </ol>
  </nav>
</body>
</html>
'''

css = '''html, body { margin: 0; padding: 0; }
body { font-family: serif; line-height: 1.9; color: #2b251c; background: #f8f3e8; }
h1 { font-size: 1.45em; font-weight: 500; margin: 0 0 1.8em; letter-spacing: .08em; }
h2 { font-size: 1.15em; font-weight: 500; margin: 1.8em 0 .8em; }
p { margin: 0 0 1.35em; text-indent: 1em; }
ruby rt { font-size: .48em; color: #a44932; }
.volume { font-size: .8em; letter-spacing: .2em; color: #8a7c68; margin-bottom: 2.4em; }
'''

chapters = [
    ('chapter1.xhtml', '第一話　吾輩は猫である', '''
      <p class="volume">第一巻　猫の手帖</p>
      <p>吾輩は<ruby>猫<rt>ねこ</rt></ruby>である。名前はまだ無い。</p>
      <p>どこで生れたかとんと<ruby>見当<rt>けんとう</rt></ruby>がつかぬ。何でも薄暗いじめじめした所で泣いていた事だけは記憶している。</p>
      <p>吾輩はここで始めて人間というものを見た。しかもあとで聞くと、それは書生という人間中で一番<ruby>獰悪<rt>どうあく</rt></ruby>な種族であったそうだ。</p>
      <p>この書生というのは時々我々を<ruby>捕<rt>つか</rt></ruby>まえて<ruby>煮<rt>に</rt></ruby>て食うという話である。</p>
    '''),
    ('chapter2.xhtml', '第二話　名前はまだ無い', '''
      <p>名前はまだ無い。どこで生れたかとんと見当がつかぬ。</p>
      <p>主人はあまり<ruby>感心<rt>かんしん</rt></ruby>しない顔で、<ruby>鼻<rt>はな</rt></ruby>の下を<ruby>撫<rt>な</rt></ruby>でながら、<ruby>呟<rt>つぶや</rt></ruby>いた。</p>
      <p>「まだ<ruby>名前<rt>なまえ</rt></ruby>がないのか」と<ruby>妻<rt>つま</rt></ruby>が言った。</p>
      <p>「<ruby>名前<rt>なまえ</rt></ruby>なんか無くても<ruby>困<rt>こま</rt></ruby>らないさ」と主人は<ruby>答<rt>こた</rt></ruby>えた。</p>
      <p><ruby>勝手<rt>かって</rt></ruby>なことを言う人間だ。こちらは<ruby>困<rt>こま</rt></ruby>るのだ。</p>
    '''),
    ('chapter3.xhtml', '第三話　どこで生れたか', '''
      <p>どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所で泣いていた。</p>
      <p><ruby>記憶<rt>きおく</rt></ruby>しているのは、<ruby>母<rt>はは</rt></ruby>の<ruby>温<rt>ぬく</rt></ruby>もりと、<ruby>夜<rt>よる</rt></ruby>の<ruby>静<rt>しず</rt></ruby>けさだけである。</p>
      <p>それからというもの、吾輩は<ruby>人間<rt>にんげん</rt></ruby>の<ruby>言葉<rt>ことば</rt></ruby>を少しずつ<ruby>覚<rt>おぼ</rt></ruby>えていった。</p>
      <p>ある<ruby>昼下<rt>ひるさ</rt></ruby>がりのこと、<ruby>縁側<rt>えんがわ</rt></ruby>で<ruby>日向<rt>ひなた</rt></ruby>ぼっこをしていると、<ruby>隣<rt>となり</rt></ruby>の<ruby>家<rt>いえ</rt></ruby>から<ruby>三毛<rt>みけ</rt></ruby>の<ruby>猫<rt>ねこ</rt></ruby>がやって来た。</p>
    ''')
]

html_head = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja">
<head>
  <meta charset="UTF-8"/>
  <title>{title}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>{title}</h1>
  {body}
</body>
</html>
'''

if os.path.exists(OUT):
    os.remove(OUT)

with zipfile.ZipFile(OUT, 'w') as z:
    z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    z.writestr('META-INF/container.xml', container, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('OEBPS/content.opf', opf, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('OEBPS/nav.xhtml', nav, compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('OEBPS/style.css', css, compress_type=zipfile.ZIP_DEFLATED)
    for name, title, body in chapters:
        z.writestr(f'OEBPS/{name}', html_head.format(title=title, body=body), compress_type=zipfile.ZIP_DEFLATED)

print(OUT, os.path.getsize(OUT))
