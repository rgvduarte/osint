// Textos do jogo de toques "a repescagem" (casting, quedas, veredictos do júri, eventos).
// Escritos por três humoristas, escolhidos por um editor e verificados contra factos inventados.
export const TEXTOS = {
  "nome_jogo": "Toca, Ricardo, Toca!",
  "titulo": "Processo n.º 7: a repescagem do casting do Ricardo",
  "intro": "Vai, vai, Xinxers-câmara! Processo n.º 7 reaberto. Em miúdo, o Ricardo era uma promessa do futebol. Foi a um casting para gravar um anúncio com o Cristiano. Veredicto do júri: \"não selecionado\". (No único casting que importava, a Inês disse que sim.) Isto é a repescagem. \"O campo tá desmanchado, tá cheio de pedras\", mas \"a gente quer jogar à bola\". Toca na bola, não a deixes cair e mostra ao júri o que perdeu.",
  "premio": "Um par de\nchuteiras\nde queijo",
  "carimbo": "NÃO SELECIONADO",
  "quedas": {
    "pedra": [
      "PEDRA! A bola bate, ressalta e… está lá? NÃO ESTÁ LÁ! Anulado pela geologia.",
      "Caiu numa pedra. \"Tá cheio de pedras\" e esta estava de serviço.",
      "Pedra. Neste campo, as pedras foram todas selecionadas à primeira."
    ],
    "bosta": [
      "PLOF! Na bosta, senhores, na bosta! Quem vai buscar a bola? Ninguém vai buscar a bola.",
      "Em cheio na bosta. Bem avisaram: \"tá cheio de pedras, cheio de merda\".",
      "Caiu na bosta. \"A gente pode-se cagar-se todos\", e a bola foi a primeira."
    ],
    "relva": [
      "Caiu na relva, suavemente, como uma carta de rejeição.",
      "No único tufo de relva do campo inteiro. Sem pedras, sem bosta… e sem desculpas.",
      "Relva. Queda limpa. O júri anotou: \"Pelo menos não foi na bosta.\""
    ]
  },
  "veredictos": [
    {
      "min": 0,
      "texto": "Não selecionado. O júri ainda nem tinha tirado a tampa à caneta."
    },
    {
      "min": 5,
      "texto": "Não selecionado. Há ali qualquer coisa, mas o júri estava a olhar para o pombo."
    },
    {
      "min": 10,
      "texto": "Não selecionado. Promissor, mas o formulário só tem duas opções: \"melhor do mundo\" e \"não\"."
    },
    {
      "min": 20,
      "texto": "Não selecionado. Aguentaste o vento e tudo, mas o júri decidiu selecionar o vento."
    },
    {
      "min": 35,
      "texto": "Não selecionado. O júri adorou, mas a vaga já estava prometida à vaca."
    },
    {
      "min": 50,
      "texto": "Não selecionado. O júri gritou SIUUU sem querer e, por regulamento, teve de anular o casting."
    },
    {
      "min": 77,
      "texto": "Não selecionado. Perfeito de mais: o júri desconfiou que eras o Cristiano disfarçado de Ricardo."
    }
  ],
  "marcos": [
    {
      "toques": 7,
      "texto": "SIUUU!"
    },
    {
      "toques": 10,
      "texto": "10! O júri pestanejou"
    },
    {
      "toques": 25,
      "texto": "Campo desmanchado, tu não"
    },
    {
      "toques": 50,
      "texto": "50! O carimbo está a tremer"
    },
    {
      "toques": 77,
      "texto": "SIUUUUUUU!"
    },
    {
      "toques": 100,
      "texto": "100! Repesquem este talento!"
    },
    {
      "toques": 150,
      "texto": "150! Até as pedras aplaudem"
    },
    {
      "toques": 200,
      "texto": "200! E mesmo assim… não."
    }
  ],
  "eventos": {
    "olheiro": {
      "nome": "Olheiro do Casting",
      "grito": "Olha o olheiro! Toques x2!"
    },
    "chuteiras": {
      "nome": "Chuteiras de Promessa",
      "grito": "Vai, vai, Xinxers-chuteiras!"
    },
    "vaca": {
      "nome": "Defesa Central Vaca",
      "grito": "Invasão de campo! É uma vaca!"
    },
    "pombo": {
      "nome": "Pombo-correio do Júri",
      "grito": "Pombo! Traz a carta: não."
    },
    "suja": {
      "nome": "Defesa Rasante",
      "grito": "A bosta pá bola!"
    },
    "vento": {
      "nome": "Nortada Desmanchada",
      "grito": "Nortada! A bola vai de lado!"
    }
  },
  "rodape": {
    "nome": "Ricardo",
    "canal": "ARQUIVO · XINXERS TV",
    "frases": {
      "intro": "«O campo tá desmanchado, tá cheio de pedras…»",
      "pedra": "«Tá cheio de pedras! A gente pode meter o pé…»",
      "bosta": "«Tá cheio de pedras, cheio de…» (já sabes o resto)",
      "relva": "«A gente quer jogar à bola!»"
    }
  },
  "video_link": "▶ Prova A: \"O campo tá desmanchado\"",
  "regulamento": [
    "Art. 1.º — Dá toques na bola com o dedo. \"A gente pode meter o pé…\", mas o ecrã não aguenta.",
    "Art. 2.º — A bola não pode tocar no chão. O chão, como se vê, não está em condições.",
    "Art. 3.º — Acerta no olheiro com a bola: durante 8 segundos, cada toque vale 2. Sem olheiro, vale 1 e um suspiro.",
    "Art. 4.º — Acerta nas chuteiras e a bola cresce durante 6 segundos. O talento fica igual.",
    "Art. 5.º — A vaca é defesa central: bola que lhe caia em cima ressalta. A bosta que deixa não conta como assistência.",
    "Art. 5.º-A — \"A gente pode defender\", e deve: mas quem salva a bola rente ao chão, por cima da bosta, fica com ela suja e mais pesada durante 6 segundos.",
    "Art. 6.º — O pombo e o vento (a partir dos 20 toques) desviam a bola sem aviso prévio. Não estão inscritos, mas participam.",
    "Art. 7.º — O resultado é sempre \"não selecionado\". Recursos por escrito, a analisar quando o inspector acordar."
  ],
  "recorde_frases": [
    "Recorde! O júri diz que não, mas mais baixinho.",
    "Recorde! O olheiro deixou cair o monóculo.",
    "Recorde batido! O teu processo subiu de secretária.",
    "Recorde! Até a vaca parou de pastar para ver.",
    "Recorde! Vai, vai, Xinxers-câmara: isto fica gravado."
  ]
};
