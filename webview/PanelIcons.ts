/** Hand-drawn pixel icons; integer cells keep edges crisp at small sizes. */
const icons: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  heart: {
    colors: { o: '#59204f', s: '#ae286d', p: '#f65399', l: '#ff92c2', h: '#ffe0ef' },
    rows: [
      '................', '................', '..oooo....oooo..', '.olllpo..olllpo.',
      'olhhllpoollllppo', 'olhlllplllllpppo', 'olllllpppppppppo', 'ollllpppppppppo.',
      '.opppppppppppso.', '..opppppppppso..', '...opppppppso...', '....opppppso....',
      '.....opppso.....', '......opso......', '.......oo.......', '................'
    ]
  },
  play: {
    colors: { o: '#372057', s: '#7650be', p: '#ad80ed', l: '#d6b3ff', h: '#f2deff', d: '#4a306d', b: '#79e8ef', r: '#ff76bb' },
    rows: [
      '................', '......oooo......', '...ooollllooo...', '..olhhhhhhhllo..',
      '..olllplllllpo..', '.olldlllplrlppo.', '.oldddllblplppo.', '.olldlllplplppo.',
      '.olllplllplllpo.', 'olllppssssppplpo', 'ollppsosso spppo'.replace(' ', 's'), 'ollpso....ospppo',
      'olpso......osppo', '.ooo........ooo.', '................', '................'
    ]
  },
  music: {
    colors: { o: '#233883', s: '#568bdd', p: '#9cceff', l: '#d1edff', h: '#f3fbff' },
    rows: [
      '................', '.........ooooo..', '.....oooolhhho..', '....olhhhllllo..',
      '....ollllppppo..', '....olpppoospo..', '....olpo...spo..', '....olpo...spo..',
      '....olpo...spo..', '....olpo.ooppo..', '..ooolpoohllpo..', '.ohllppoopppso..',
      'olllppso.oooo...', 'oppppso.........', '.ooooo..........', '................'
    ]
  },
  settings: {
    colors: { o: '#45305d', s: '#8260a6', p: '#bea0e0', l: '#e3cafa', h: '#fbecff' },
    rows: [
      '......oooo......', '......ohlo......', '..oooolllloooo..', '..ollllllllplo..',
      '..olllooooplpo..', '..ollossssolpo..', 'oollos....solpoo', 'ohllos....sopplo',
      'olplos....sopppo', 'ooppos....sopsoo', '..oppossssopso..', '..opppooooppso..',
      '..opppppppppso..', '..ooooppsooooo..', '......opso......', '......oooo......'
    ]
  }
};

export function drawPanelIcon(canvas: HTMLCanvasElement, name: string): boolean {
  const icon = icons[name];
  const context = canvas.getContext('2d');
  if (!icon || !context) return false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  const cell = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 16));
  icon.rows.forEach((row, y) => Array.from(row).forEach((pixel, x) => {
    const color = icon.colors[pixel];
    if (color) { context.fillStyle = color; context.fillRect(x * cell, y * cell, cell, cell); }
  }));
  return true;
}
